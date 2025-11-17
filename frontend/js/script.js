// 전역 변수 - 배포 환경에 따라 자동으로 URL 설정
const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

// 개발 환경: localhost 서버 사용
// 배포 환경: 상대 경로 사용 (Vercel이 /api를 Python 백엔드로 프록시)
const API_BASE_URL = isDevelopment 
    ? 'http://localhost:3000/api' 
    : '/api'; // Vercel rewrites를 통해 Python 백엔드로 프록시
const PYTHON_API_URL = isDevelopment 
    ? 'http://localhost:5000/api' 
    : '/api'; // 배포 환경에서는 같은 경로

// 차트 인스턴스 보관
const chartInstances = {};

// DOM 요소 변수
let chatMessages, userInput, sendButton, imageUploadInput, imageUploadButton;

// 최근 비전 분석 결과 저장 (관련종목에서 활용)
let lastVisionResult = null;

// 간단한 응답 규칙
const responses = {
    '안녕': '안녕하세요!',
    '안녕하세요': '안녕하세요! 주식 정보를 검색해드립니다.',
    '반가워': '반가워요!',
    '이름': '저는 주식 정보 챗봇입니다.',
    '도움말': '종목명이나 심볼을 입력하면 주가 정보를 알려드립니다.',
    '고마워': '천만에요!',
    '감사': '별말씀을요!',
    '종료': '안녕히 가세요!',
};

const MARKET_ALIAS_MAP = {
    'nasdaq': 'NASDAQ',
    '나스닥': 'NASDAQ',
    'nyse': 'NYSE',
    '뉴욕증권거래소': 'NYSE',
    'krx': 'KRX',
    'kospi': 'KRX',
    '코스피': 'KRX',
    'kosdaq': 'KRX',
    '코스닥': 'KRX',
    'xetra': 'XETRA',
    '독일': 'XETRA',
    'frankfurt': 'XETRA',
    '프랑크푸르트': 'XETRA',
    'hkex': 'HKEX',
    '홍콩': 'HKEX',
    'sse': 'SSE',
    '상해': 'SSE',
    'szse': 'SZSE',
    '심천': 'SZSE',
    'twse': 'TWSE',
    '대만': 'TWSE'
};

const SUPPORTED_MARKETS = new Set(['NASDAQ', 'NYSE', 'KRX', 'XETRA', 'HKEX', 'SSE', 'SZSE', 'TWSE']);

// 이미지 업로드 처리
async function handleImageFile(file) {
    if (!file) {
        return;
    }

    displayImagePreviewMessage(file);

    const loadingId = addLoadingMessage('이미지 분석 중...');

    try {
        // 1단계: 빠른 분석(핵심 필드만) 먼저 요청
        const quickResult = await requestVisionAnalysis(file, 'quick');

        removeMessage(loadingId);

        if (quickResult) {
            const renderCtx = addVisionPrimaryMessage(quickResult); // 핵심 필드 즉시 표시

            // 핵심 결과 기반으로 종목 자동 로드(차트/요약 카드 표시)
            let stockCandidateQuick = null;
            try {
                stockCandidateQuick = getVisionStockCandidate(quickResult);
                if (stockCandidateQuick) {
                    const stockData = await fetchStockData(stockCandidateQuick.searchTicker);
                    if (stockData) {
                        addStockMessage(stockData);
                    }
                }
            } catch (e) {
                console.error('빠른 분석 기반 종목 자동 로드 오류:', e);
            }

            // 비상장 회사인 경우 추가 분석 중 메시지 표시
            let investableStockLoadingId = null;
            const primary = quickResult?.primary;
            const primaryMarket = primary?.company_market;
            const isPrivate = !primaryMarket || 
                              String(primaryMarket).toLowerCase() === '비상장' || 
                              String(primaryMarket).toLowerCase() === 'nonlisted' ||
                              String(primaryMarket).toLowerCase() === 'unlisted';
            
            if (!stockCandidateQuick && isPrivate) {
                investableStockLoadingId = addLoadingMessage('직접투자 가능 종목 분석중...');
            }

            // 2단계: 보강 정보를 백그라운드로 요청해서 UI 갱신
            requestVisionAnalysis(file, 'full')
                .then(async fullResult => {
                    if (fullResult) {
                        // 전역 변수에 비전 결과 저장 (관련종목에서 활용)
                        lastVisionResult = fullResult;
                        
                        updateVisionEnrichmentMessage(renderCtx.enrichmentContainerId, fullResult);
                        
                        // 빠른 모드에서 메인카드를 못 띄웠고, 지주회사 정보가 있으면 메인카드 띄우기
                        if (!stockCandidateQuick && fullResult.holding_company) {
                            try {
                                const stockCandidateFull = getVisionStockCandidate(fullResult);
                                if (stockCandidateFull && stockCandidateFull.source === 'holding_company') {
                                    // 로딩 메시지 제거
                                    if (investableStockLoadingId) {
                                        removeMessage(investableStockLoadingId);
                                        investableStockLoadingId = null;
                                    }
                                    
                                    const stockData = await fetchStockData(stockCandidateFull.searchTicker);
                                    if (stockData) {
                                        addStockMessage(stockData);
                                    }
                                }
                            } catch (e) {
                                console.error('지주회사 기반 종목 자동 로드 오류:', e);
                            }
                        }
                        
                        // 지주회사 정보도 없으면 로딩 메시지 제거
                        if (investableStockLoadingId) {
                            removeMessage(investableStockLoadingId);
                        }
                    }
                })
                .catch(err => {
                    console.error('비동기 보강 로드 오류:', err);
                    // 오류 발생 시 로딩 메시지 제거
                    if (investableStockLoadingId) {
                        removeMessage(investableStockLoadingId);
                    }
                });
        } else {
            addMessage('이미지 분석 결과를 가져오지 못했습니다.', 'bot');
        }
    } catch (error) {
        console.error('이미지 분석 오류:', error);
        removeMessage(loadingId);
        addMessage('이미지 분석 중 오류가 발생했습니다.', 'bot');
    }
}

function displayImagePreviewMessage(file) {
    const reader = new FileReader();
    reader.onload = () => {
        const img = document.createElement('img');
        img.src = reader.result;
        img.alt = file.name || '업로드한 이미지';
        img.className = 'image-preview';
        addMessage(img, 'user');
    };
    reader.readAsDataURL(file);
}

async function requestVisionAnalysis(file, mode = 'quick') {
    const formData = new FormData();
    formData.append('file', file, file.name || 'image.jpg');

    const qs = mode === 'quick' ? '?mode=quick' : '';
    const response = await fetch(`${PYTHON_API_URL}/vision/analyze-image${qs}`, {
        method: 'POST',
        body: formData
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`이미지 분석 API 오류 (${response.status}): ${errorText}`);
    }

    return response.json();
}

// 1단계: 핵심 필드를 먼저 렌더링하고, 보강 정보용 컨테이너를 예약
function addVisionPrimaryMessage(result) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message bot-message';

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content stock-content';

    const container = document.createElement('div');
    container.className = 'vision-result';

    const primary = result?.primary || {};
    const fallback = result?.fallback;
    const usedFallback = Boolean(result?.used_fallback);

    const fieldsHtml = `
        <div class="vision-model">기본 분석 모델: ${primary.model || '알 수 없음'}</div>
        <div class="vision-fields">
            ${createVisionField('주요 물체', primary.object)}
            ${createVisionField('브랜드', primary.brand)}
            ${createVisionField('소유 기업', primary.company)}
            ${createVisionField('상장 시장', primary.company_market)}
            ${createVisionField('티커', primary.company_ticker)}
        </div>
        ${
            usedFallback && fallback
                ? `<div class="vision-summary-block">
                        <h5>Gemini 폴백 결과 (${fallback.model || '알 수 없음'})</h5>
                        <div class="vision-fields">
                            ${createVisionField('주요 물체', fallback.object)}
                            ${createVisionField('브랜드', fallback.brand)}
                            ${createVisionField('소유 기업', fallback.company)}
                            ${createVisionField('상장 시장', fallback.company_market)}
                            ${createVisionField('티커', fallback.company_ticker)}
                        </div>
                        ${fallback.error ? `<div class="vision-fallback-note">⚠️ 폴백 오류: ${fallback.error}</div>` : ''}
                   </div>`
                : ''
        }
    `;

    // 보강 정보가 들어갈 자리(비동기 업데이트)
    const enrichmentContainerId = `vision-enrichment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    container.innerHTML = `
        <h4>🧠 이미지 분석 결과</h4>
        ${fieldsHtml}
        <div id="${enrichmentContainerId}" class="vision-enrichment-placeholder"></div>
    `;

    contentDiv.appendChild(container);
    messageDiv.appendChild(contentDiv);
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    return { messageDiv, enrichmentContainerId };
}

// 2단계: 보강 정보(지주회사/밸류체인/관련 상장사)를 채워 넣기
function updateVisionEnrichmentMessage(enrichmentContainerId, result) {
    const target = document.getElementById(enrichmentContainerId);
    if (!target) return;

    let enrichmentHtml = '';

    // 1. 지주회사 정보
    if (result?.holding_company) {
        const hc = result.holding_company;
        enrichmentHtml += `
            <div class="vision-enrichment-section">
                <h5>🏢 지주회사 상장 정보</h5>
                <div class="vision-fields">
                    ${createVisionField('지주회사', hc.holding_company)}
                    ${createVisionField('상장 거래소', hc.holding_market)}
                    ${createVisionField('티커', hc.holding_ticker)}
                    ${hc.holding_confidence ? `<div class="vision-field"><span class="label">신뢰도</span><span class="value">${(hc.holding_confidence * 100).toFixed(1)}%</span></div>` : ''}
                </div>
                ${hc.holding_sources && hc.holding_sources.length > 0 
                    ? `<div class="vision-sources"><strong>출처:</strong> ${hc.holding_sources.join(', ')}</div>` 
                    : ''}
            </div>
        `;
    }

    // 2. 밸류체인 공급사
    if (result?.value_chain && result.value_chain.length > 0) {
        enrichmentHtml += `
            <div class="vision-enrichment-section">
                <h5>🔗 주요 부품·공급사 (밸류체인)</h5>
                <div class="value-chain-list">
                    ${result.value_chain.map((vc, idx) => `
                        <div class="value-chain-item">
                            <div class="value-chain-header">
                                <strong>${idx + 1}. ${vc.component || '-'}</strong>
                                ${vc.confidence ? `<span class="confidence-badge">신뢰도: ${(vc.confidence * 100).toFixed(0)}%</span>` : ''}
                            </div>
                            <div class="vision-fields">
                                ${createVisionField('공급사', vc.supplier_company)}
                                ${createVisionField('거래소', vc.supplier_exchange)}
                                ${createVisionField('티커', vc.supplier_ticker)}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    // 3. 관련 상장사
    if (result?.related_public_companies && result.related_public_companies.length > 0) {
        enrichmentHtml += `
            <div class="vision-enrichment-section">
                <h5>🔎 제품 관련 상장사</h5>
                <div class="related-companies-list">
                    ${result.related_public_companies.map((comp, idx) => `
                        <div class="related-company-item">
                            <strong>${idx + 1}. ${comp.company || '-'}</strong>
                            <span class="company-info">${comp.market || '-'} · ${comp.ticker || '-'}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    target.innerHTML = enrichmentHtml;
}
function addVisionResultMessage(result) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message bot-message';

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content stock-content';

    const container = document.createElement('div');
    container.className = 'vision-result';

    const primary = result?.primary || {};
    const fallback = result?.fallback;
    const usedFallback = Boolean(result?.used_fallback);

    const fieldsHtml = `
        <div class="vision-model">기본 분석 모델: ${primary.model || '알 수 없음'}</div>
        <div class="vision-fields">
            ${createVisionField('주요 물체', primary.object)}
            ${createVisionField('브랜드', primary.brand)}
            ${createVisionField('소유 기업', primary.company)}
            ${createVisionField('상장 시장', primary.company_market)}
            ${createVisionField('티커', primary.company_ticker)}
        </div>
    `;

    // 보강 정보 HTML 생성
    let enrichmentHtml = '';
    
    // 1. 지주회사 정보
    if (result?.holding_company) {
        const hc = result.holding_company;
        enrichmentHtml += `
            <div class="vision-enrichment-section">
                <h5>🏢 지주회사 상장 정보</h5>
                <div class="vision-fields">
                    ${createVisionField('지주회사', hc.holding_company)}
                    ${createVisionField('상장 거래소', hc.holding_market)}
                    ${createVisionField('티커', hc.holding_ticker)}
                    ${hc.holding_confidence ? `<div class="vision-field"><span class="label">신뢰도</span><span class="value">${(hc.holding_confidence * 100).toFixed(1)}%</span></div>` : ''}
                </div>
                ${hc.holding_sources && hc.holding_sources.length > 0 
                    ? `<div class="vision-sources"><strong>출처:</strong> ${hc.holding_sources.join(', ')}</div>` 
                    : ''}
            </div>
        `;
    }
    
    // 2. 밸류체인 공급사
    if (result?.value_chain && result.value_chain.length > 0) {
        enrichmentHtml += `
            <div class="vision-enrichment-section">
                <h5>🔗 주요 부품·공급사 (밸류체인)</h5>
                <div class="value-chain-list">
                    ${result.value_chain.map((vc, idx) => `
                        <div class="value-chain-item">
                            <div class="value-chain-header">
                                <strong>${idx + 1}. ${vc.component || '-'}</strong>
                                ${vc.confidence ? `<span class="confidence-badge">신뢰도: ${(vc.confidence * 100).toFixed(0)}%</span>` : ''}
                            </div>
                            <div class="vision-fields">
                                ${createVisionField('공급사', vc.supplier_company)}
                                ${createVisionField('거래소', vc.supplier_exchange)}
                                ${createVisionField('티커', vc.supplier_ticker)}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }
    
    // 3. 관련 상장사
    if (result?.related_public_companies && result.related_public_companies.length > 0) {
        enrichmentHtml += `
            <div class="vision-enrichment-section">
                <h5>🔎 제품 관련 상장사</h5>
                <div class="related-companies-list">
                    ${result.related_public_companies.map((comp, idx) => `
                        <div class="related-company-item">
                            <strong>${idx + 1}. ${comp.company || '-'}</strong>
                            <span class="company-info">${comp.market || '-'} · ${comp.ticker || '-'}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    container.innerHTML = `
        <h4>🧠 이미지 분석 결과</h4>
        ${fieldsHtml}
        ${
            fallback
                ? `<div class="vision-summary-block">
                        <h5>Gemini 폴백 결과 (${fallback.model || '알 수 없음'})</h5>
                        <div class="vision-fields">
                            ${createVisionField('주요 물체', fallback.object)}
                            ${createVisionField('브랜드', fallback.brand)}
                            ${createVisionField('소유 기업', fallback.company)}
                            ${createVisionField('상장 시장', fallback.company_market)}
                            ${createVisionField('티커', fallback.company_ticker)}
                        </div>
                        ${fallback.error ? `<div class="vision-fallback-note">⚠️ 폴백 오류: ${fallback.error}</div>` : ''}
                   </div>`
                : ''
        }
        ${
            usedFallback
                ? `<div class="vision-fallback-note">⚠️ 기본 분석이 실패하여 Gemini 직접 분석 결과가 사용되었습니다.</div>`
                : ''
        }
        ${enrichmentHtml}
    `;

    const stockCandidate = getVisionStockCandidate(result);

    if (stockCandidate) {
        fetchStockData(stockCandidate.searchTicker)
            .then((stockData) => {
                if (stockData) {
                    addStockMessage(stockData);
                } else {
                    const tickerLabel = `${stockCandidate.market}:${stockCandidate.ticker}`;
                    addMessage(`${tickerLabel} 주가 정보를 찾을 수 없습니다.`, 'bot');
                }
            })
            .catch((error) => {
                console.error('Vision 연동 주가 조회 오류:', error);
                addMessage('주가 정보를 가져오는 중 오류가 발생했습니다.', 'bot');
            });
    }

    contentDiv.appendChild(container);
    messageDiv.appendChild(contentDiv);
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function createVisionField(label, value) {
    return `
        <div class="vision-field">
            <span class="label">${label}</span>
            <span class="value">${formatVisionValue(value)}</span>
        </div>
    `;
}

function formatVisionValue(value) {
    if (value === null || value === undefined) return '-';
    const stringValue = String(value).trim();
    if (!stringValue || stringValue.toLowerCase() === 'null') return '-';
    return escapeHtml(stringValue);
}

function escapeHtml(str) {
    str = String(str);
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function normalizeMarketName(value) {
    if (!value && value !== 0) return null;
    const key = String(value).trim();
    if (!key) return null;
    const lookupKey = key.toLowerCase();
    if (lookupKey in MARKET_ALIAS_MAP) {
        return MARKET_ALIAS_MAP[lookupKey];
    }
    const upper = key.toUpperCase();
    return SUPPORTED_MARKETS.has(upper) ? upper : null;
}

function sanitizeTicker(value) {
    if (!value && value !== 0) return null;
    const raw = String(value).trim();
    if (!raw) return null;
    const compact = raw.replace(/\s+/g, '');
    const lowered = compact.toLowerCase();
    if (
        lowered === '비상장' ||
        lowered === 'nonlisted' ||
        lowered === 'private' ||
        lowered === 'na' ||
        lowered === 'n/a' ||
        lowered === 'null' ||
        lowered === 'none'
    ) {
        return null;
    }
    if (/^[0-9]+$/.test(compact)) {
        return compact;
    }
    return compact.toUpperCase();
}

function getVisionStockCandidate(result) {
    const sections = [];
    
    const primary = result?.primary;
    const primaryMarket = primary?.company_market;
    const isPrivate = !primaryMarket || 
                      String(primaryMarket).toLowerCase() === '비상장' || 
                      String(primaryMarket).toLowerCase() === 'nonlisted' ||
                      String(primaryMarket).toLowerCase() === 'unlisted';
    
    // 비상장이면서 지주회사 정보가 있으면 지주회사를 최우선으로
    if (isPrivate && result?.holding_company) {
        const hc = result.holding_company;
        sections.push({
            company_ticker: hc.holding_ticker,
            company_market: hc.holding_market,
            company: hc.holding_company,
            source: 'holding_company'
        });
    }
    
    // 그 다음 primary
    if (result?.primary) {
        sections.push({ ...result.primary, source: 'primary' });
    }
    
    // fallback
    if (result?.fallback) {
        sections.push({ ...result.fallback, source: 'fallback' });
    }
    
    // 비상장이 아닌 경우(상장사)는 지주회사를 마지막에 추가
    if (!isPrivate && result?.holding_company) {
        const hc = result.holding_company;
        sections.push({
            company_ticker: hc.holding_ticker,
            company_market: hc.holding_market,
            company: hc.holding_company,
            source: 'holding_company'
        });
    }

    for (const section of sections) {
        const market = normalizeMarketName(section.company_market);
        if (!market || !SUPPORTED_MARKETS.has(market)) {
            continue;
        }
        let ticker = sanitizeTicker(section.company_ticker);
        const company = (section.company || '').trim();

        let searchTicker = null;
        if (market === 'KRX') {
            if (ticker && /^\d{6}$/.test(ticker)) {
                searchTicker = ticker; // 정식 6자리 심볼
            } else if (company) {
                // 한국 종목은 회사명으로도 검색 가능 (에이피알 등)
                searchTicker = company;
            }
        } else {
            // US, XETRA, HKEX 등: 티커 우선, 없으면 회사명으로 시도
            if (ticker && /^[A-Z0-9]{1,6}$/.test(ticker)) {
                // XETRA, HKEX 등 특정 거래소는 Yahoo Finance 형식으로 변환
                if (market === 'XETRA') {
                    searchTicker = ticker.includes('.DE') ? ticker : `${ticker}.DE`;
                } else if (market === 'HKEX') {
                    // 홍콩: 숫자 4자리 + .HK (예: 0700.HK)
                    searchTicker = ticker.includes('.HK') ? ticker : `${ticker.padStart(4, '0')}.HK`;
                } else if (market === 'SSE' || market === 'SZSE') {
                    // 중국: SSE는 .SS, SZSE는 .SZ
                    const suffix = market === 'SSE' ? '.SS' : '.SZ';
                    searchTicker = ticker.includes(suffix) ? ticker : `${ticker}${suffix}`;
                } else if (market === 'TWSE') {
                    // 대만: .TW
                    searchTicker = ticker.includes('.TW') ? ticker : `${ticker}.TW`;
                } else {
                    // NASDAQ, NYSE 등은 그대로 사용
                searchTicker = ticker;
                }
            } else if (company) {
                searchTicker = company;
            }
        }

        if (searchTicker) {
            return {
                market,
                ticker: ticker || '',
                searchTicker,
                source: section.source,
                company,
                brand: section.brand || ''
            };
        }
    }
    return null;
}

// 사용자 메시지 전송
async function sendMessage() {
    if (!userInput) {
        console.error('userInput이 정의되지 않았습니다.');
        return;
    }
    
    const message = userInput.value.trim();
    
    if (message === '') {
        return;
    }
    
    console.log('메시지 전송:', message);
    
    // 사용자 메시지 먼저 표시
    addMessage(message, 'user');
    userInput.value = '';
    
    // 로딩 메시지 표시
    const loadingId = addLoadingMessage('답변 중 ...');
    
    try {
        // AI 파서 결과 적용 (쉼표로 구분된 다중 입력이 아닐 때만)
        let searchInput = message;
        let aiTicker = null;
        let isStockIntent = null;
        if (!message.includes(',')) {
            const aiParseResult = await requestStockParse(message);
            if (aiParseResult?.is_stock_query && aiParseResult.stock_name) {
                if (aiParseResult.ticker) {
                    aiTicker = aiParseResult.ticker.trim();
                }
                searchInput = (aiTicker || aiParseResult.stock_name).trim();
                console.log('[AI 파서 적용]', aiParseResult);
                isStockIntent = true;
            } else if (aiParseResult && aiParseResult.is_stock_query === false) {
                isStockIntent = false;
            }
        }
        
        // 주식 의도가 아닌 경우: 즉시 금융 Q&A로 분기
        if (isStockIntent === false) {
            // 로딩 메시지 제거
            removeMessage(loadingId);
            const qa = await requestFinanceQA(message);
            if (qa && qa.answer) {
                addMessage(qa.answer, 'bot');
            } else {
                const botResponse = getBotResponse(message);
                addMessage(botResponse, 'bot');
            }
            return;
        }

        // 여러 종목 입력 확인 (쉼표로 구분)
        const stocks = parseMultipleStocks(searchInput);
        
        if (stocks.length > 1) {
            // 로딩 메시지 제거
            removeMessage(loadingId);
            // 여러 종목인 경우 버튼 목록 표시
            addStockSelectionButtons(stocks);
        } else {
            // 주가 정보 검색
            const stockData = await fetchStockData(aiTicker || stocks[0] || searchInput);
            
            // 로딩 메시지 제거
            removeMessage(loadingId);
            
            if (stockData) {
                // 주가 정보 표시
                addStockMessage(stockData);
            } else {
                // 금융 Q&A 시도
                try {
                    const qa = await requestFinanceQA(message);
                    if (qa && qa.answer) {
                        addMessage(qa.answer, 'bot');
                    } else {
                        const botResponse = getBotResponse(message);
                        addMessage(botResponse, 'bot');
                    }
                } catch (e) {
                    console.error('금융 Q&A 오류:', e);
                    const botResponse = getBotResponse(message);
                    addMessage(botResponse, 'bot');
                }
            }
        }
    } catch (error) {
        removeMessage(loadingId);
        addMessage('주가 정보를 가져오는 중 오류가 발생했습니다.', 'bot');
        console.error('오류:', error);
    }
}

// 여러 종목 파싱 (쉼표로 구분)
function parseMultipleStocks(message) {
    return message.split(',').map(s => s.trim()).filter(s => s.length > 0);
}

// 주가 정보 가져오기
async function fetchStockData(query) {
    try {
        const response = await fetch(`${API_BASE_URL}/stock/${encodeURIComponent(query)}`);
        
        if (!response.ok) {
            if (response.status === 404) {
                return null; // 주식 정보를 찾을 수 없음
            }
            throw new Error('서버 오류');
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('주가 정보 조회 오류:', error);
        return null;
    }
}

// AI 주식 파서 호출 (테스트용)
async function requestStockParse(input) {
    try {
        const response = await fetch(`${PYTHON_API_URL}/parse-stock-query`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ message: input })
        });

        if (!response.ok) {
            throw new Error(`서버 오류 (${response.status})`);
        }

        const data = await response.json();
        console.log('[AI 파서 응답]', { input, data });
        return data;
    } catch (error) {
        console.error('[AI 파서 오류]', error);
        return null;
    }
}

// 금융 Q&A 요청
async function requestFinanceQA(question) {
    try {
        const response = await fetch(`${PYTHON_API_URL}/finance/qa`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question })
        });
        if (!response.ok) {
            return null;
        }
        return await response.json();
    } catch (e) {
        return null;
    }
}

// 차트 데이터 가져오기
async function fetchChartData(symbol, period = '1m') {
    try {
        const response = await fetch(`${API_BASE_URL}/stock/${symbol}/chart?period=${period}`);
        
        if (!response.ok) {
            throw new Error('차트 데이터를 가져올 수 없습니다.');
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('차트 데이터 조회 오류:', error);
        return null;
    }
}

// 뉴스 데이터 가져오기
async function fetchStockNews(symbol) {
    try {
        const response = await fetch(`${API_BASE_URL}/stock/${symbol}/news`);
        
        if (!response.ok) {
            throw new Error('뉴스를 가져올 수 없습니다.');
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('뉴스 조회 오류:', error);
        return null;
    }
}

// 재무제표 데이터 가져오기
async function fetchStockFinancials(symbol) {
    try {
        const response = await fetch(`${API_BASE_URL}/stock/${symbol}/financials`);
        
        if (!response.ok) {
            throw new Error('재무제표를 가져올 수 없습니다.');
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('재무제표 조회 오류:', error);
        return null;
    }
}

// 재무제표 메시지 추가
function addFinancialMessage(companyName, symbol, financialData) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message bot-message';
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content stock-content';
    
    // 고유 차트 ID 생성
    const chartId = `financial-chart-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const segmentChartId = `segment-chart-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const financialSection = document.createElement('div');
    financialSection.className = 'financial-section';
    // 재무제표 섹션에 고유 ID 부여(뒤로가기/접기 토글을 위해)
    const financialSectionId = `financial-section-${symbol}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const financialBodyId = `${financialSectionId}-body`;
    financialSection.id = financialSectionId;
    
    // 최신 데이터 가져오기
    const latest = financialData.latest || {};
    const latestYear = latest.year || '';
    const hasSegments = financialData.segments && financialData.segments.length > 0;
    
    // 통화 정보 가져오기
    const currency = financialData.currency || 'KRW';
    
    const chartData = financialData.chartData || [];
    const quarterData = chartData.filter(item => typeof item.year === 'string' && item.year.includes('Q'));
    const annualData = chartData.filter(item => typeof item.year === 'string' && !item.year.includes('Q'));
    const hasQuarterData = quarterData.length > 0;
    const hasAnnualData = annualData.length > 0;

    const defaultData = hasQuarterData ? quarterData : annualData;

    financialSection.innerHTML = `
        <div class="financial-title" style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
            <h4 style="margin:0;">📊 ${companyName} 재무제표</h4>
            <button class="financial-collapse-btn" data-target="${financialBodyId}">접기</button>
        </div>
        <div id="${financialBodyId}" class="financial-body" style="margin-top:8px;">
            ${(hasQuarterData || hasAnnualData) ? `
            <div class="financial-toggle">
                ${hasQuarterData ? `<button class="toggle-btn ${hasQuarterData ? 'active' : ''}" data-type="quarter">최근 분기</button>` : ''}
                ${hasAnnualData ? `<button class="toggle-btn ${hasQuarterData ? '' : 'active'}" data-type="annual">연간</button>` : ''}
            </div>
            ` : ''}
            <div class="financial-chart-slider">
                <div class="chart-slider-tabs">
                    <button class="chart-slider-tab active" data-chart="financial">재무제표</button>
                    ${hasSegments ? `<button class="chart-slider-tab" data-chart="segment">사업 부문별 매출</button>` : ''}
                    <button class="chart-slider-tab" data-chart="earnings" data-symbol="${symbol}">어닝콜</button>
                </div>
                <div class="chart-slider-container">
                    <div class="chart-slide active" data-chart="financial">
                        <div class="financial-chart-container">
                            <canvas id="${chartId}"></canvas>
                        </div>
                    </div>
                    ${hasSegments ? `
                    <div class="chart-slide" data-chart="segment">
                        <div class="segment-chart-container">
                            <canvas id="${segmentChartId}"></canvas>
                        </div>
                        ${financialData.segmentDate ? `<div class="segment-date">기준일: ${financialData.segmentDate}</div>` : ''}
                    </div>
                    ` : ''}
                    <div class="chart-slide" data-chart="earnings" id="earnings-slide-${symbol}">
                        <div class="earnings-call-container">
                            <div class="earnings-loading">로딩 중...</div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="financial-summary">
                <div class="financial-item">
                    <span class="financial-label">매출액</span>
                    <span class="financial-value">${latestYear ? formatNumberInHundredMillion(latest.revenue, currency) : '-'}</span>
                </div>
                <div class="financial-item">
                    <span class="financial-label">영업이익</span>
                    <span class="financial-value">${latestYear ? formatNumberInHundredMillion(latest.operatingIncome, currency) : '-'}</span>
                </div>
                <div class="financial-item">
                    <span class="financial-label">당기순이익</span>
                    <span class="financial-value">${latestYear ? formatNumberInHundredMillion(latest.netIncome, currency) : '-'}</span>
                </div>
            </div>
            ${latestYear ? `<div class="financial-year">기준연도: ${latestYear}</div>` : ''}
            <div class="financial-question-buttons">
                <button class="financial-question-btn" data-type="revenue" data-company="${companyName}" data-symbol="${symbol}">
                    <span class="question-keyword">(매출액)</span> "이 회사 앞으로도 계속 성장할까?"
                </button>
                <button class="financial-question-btn" data-type="operating" data-company="${companyName}" data-symbol="${symbol}">
                    <span class="question-keyword">(영업이익)</span> "이 회사 주력사업으로 돈을 제대로 벌고 있을까?"
                </button>
                <button class="financial-question-btn" data-type="debt" data-company="${companyName}" data-symbol="${symbol}">
                    <span class="question-keyword">(당기순이익)</span> "이 회사 결국 주주에게 얼마를 벌어다 주는 걸까?"
                </button>
            </div>
            <div style="margin-top:16px; text-align:right;">
                <button class="scroll-to-main-btn" data-symbol="${symbol}">⬆️ 메인카드로 이동</button>
            </div>
        </div>
    `;
    
    contentDiv.appendChild(financialSection);
    messageDiv.appendChild(contentDiv);
    chatMessages.appendChild(messageDiv);
    
    // 차트 렌더링
    setTimeout(() => {
        renderFinancialChart(chartId, defaultData, currency);

        const toggleButtons = financialSection.querySelectorAll('.financial-toggle .toggle-btn');
        toggleButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const type = btn.dataset.type;
                toggleButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const selectedData = type === 'annual' ? annualData : quarterData;
                renderFinancialChart(chartId, selectedData, currency);
            });
        });

        // 차트 슬라이더 탭 이벤트
        const chartTabs = financialSection.querySelectorAll('.chart-slider-tab');
        const chartSlides = financialSection.querySelectorAll('.chart-slide');
        
        chartTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const chartType = tab.dataset.chart;
                
                // 탭 활성화
                chartTabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                
                // 슬라이드 전환
                chartSlides.forEach(slide => {
                    if (slide.dataset.chart === chartType) {
                        slide.classList.add('active');
                    } else {
                        slide.classList.remove('active');
                    }
                });
                
                // 세그먼트 차트가 처음 보일 때 렌더링
                if (chartType === 'segment' && hasSegments) {
                    const segmentSlide = financialSection.querySelector('.chart-slide[data-chart="segment"]');
                    const segmentCanvas = segmentSlide.querySelector('canvas');
                    if (segmentCanvas && !segmentCanvas.dataset.rendered) {
                        console.log('세그먼트 데이터:', financialData.segments);
                        renderSegmentChart(segmentChartId, financialData.segments, financialData.segmentCurrency || 'USD');
                        segmentCanvas.dataset.rendered = 'true';
                    }
                }
                
                // 어닝콜이 처음 보일 때 로드
                if (chartType === 'earnings') {
                    const earningsSlide = financialSection.querySelector('.chart-slide[data-chart="earnings"]');
                    const earningsContainer = earningsSlide.querySelector('.earnings-call-container');
                    if (earningsContainer && !earningsContainer.dataset.loaded) {
                        loadEarningsCall(symbol, earningsContainer);
                        earningsContainer.dataset.loaded = 'true';
                    }
                }
            });
        });

        // 세그먼트 차트는 탭 클릭 시에만 렌더링 (지연 로딩)
        
        // 재무 질문 버튼 이벤트 리스너
        const questionButtons = financialSection.querySelectorAll('.financial-question-btn');
        questionButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const questionType = btn.dataset.type;
                const company = btn.dataset.company;
                const symbol = btn.dataset.symbol;
                
                // 사용자 메시지 먼저 표시
                let userMessage = '';
                if (questionType === 'operating') {
                    userMessage = '영업이익';
                } else if (questionType === 'revenue') {
                    userMessage = '매출액';
                } else if (questionType === 'debt') {
                    userMessage = '부채비율';
                }
                
                if (userMessage) {
                    addMessage(userMessage, 'user');
                }
                
                if (questionType === 'operating') {
                    // 영업이익 상세 카드 표시
                    addOperatingIncomeCard(company, symbol, financialSectionId);
                } else if (questionType === 'revenue') {
                    // 매출액 상세 카드 표시
                    addRevenueCard(company, symbol, financialSectionId);
                } else if (questionType === 'debt') {
                    // 부채비율 상세 카드 표시
                    addDebtRatioCard(company, symbol, financialSectionId);
                }
            });
        });

        // 접기/펼치기 토글
        const collapseBtn = financialSection.querySelector('.financial-collapse-btn');
        const bodyEl = document.getElementById('${financialSectionId}-body'.replace('${financialSectionId}', financialSectionId));
        if (collapseBtn && bodyEl) {
            collapseBtn.addEventListener('click', () => {
                const isHidden = bodyEl.style.display === 'none';
                if (isHidden) {
                    bodyEl.style.display = '';
                    collapseBtn.textContent = '접기';
                } else {
                    bodyEl.style.display = 'none';
                    collapseBtn.textContent = '펼치기';
                }
            });
        }
        
        // 메인카드로 이동 버튼 이벤트 리스너
        const scrollToMainBtn = financialSection.querySelector('.scroll-to-main-btn');
        if (scrollToMainBtn) {
            scrollToMainBtn.addEventListener('click', () => {
                const symbol = scrollToMainBtn.dataset.symbol;
                scrollToMainCard(symbol);
            });
        }
    }, 100);
    
    // 카드 타이틀이 보이도록 스크롤
    setTimeout(() => {
        const financialTitle = financialSection.querySelector('.financial-title');
        if (financialTitle) {
            const titleTop = messageDiv.offsetTop + financialTitle.offsetTop;
            const offset = 80; // 충분한 여유 공간
            chatMessages.scrollTo({
                top: titleTop - offset,
                behavior: 'smooth'
            });
        }
    }, 200);
}

// 세그먼트 파이 차트 렌더링
function renderSegmentChart(canvasId, segments, currency) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !segments || segments.length === 0) {
        return;
    }
    
    // 5% 미만은 Others로 묶기
    const threshold = 5.0;
    const largeSegments = segments.filter(s => s.percentage >= threshold);
    const smallSegments = segments.filter(s => s.percentage < threshold);
    
    let chartSegments = [...largeSegments];
    if (smallSegments.length > 0) {
        const othersRevenue = smallSegments.reduce((sum, s) => sum + (s.revenue || 0), 0);
        const othersPercentage = smallSegments.reduce((sum, s) => sum + (s.percentage || 0), 0);
        if (othersRevenue > 0) {
            chartSegments.push({
                segment: 'Others',
                revenue: othersRevenue,
                percentage: othersPercentage
            });
        }
    }
    
    const labels = chartSegments.map(s => s.segment);
    const data = chartSegments.map(s => s.revenue);
    
    // 생동감 있는 보라색 계열 그라데이션 색상
    const vibrantColors = [
        'rgba(139, 92, 246, 0.9)',   // 보라
        'rgba(236, 72, 153, 0.9)',   // 핑크
        'rgba(59, 130, 246, 0.9)',   // 블루
        'rgba(16, 185, 129, 0.9)',   // 그린
        'rgba(245, 158, 11, 0.9)',   // 오렌지
        'rgba(168, 85, 247, 0.9)',   // 라벤더
        'rgba(14, 165, 233, 0.9)',   // 스카이블루
        'rgba(249, 115, 22, 0.9)',   // 살구색
        'rgba(52, 211, 153, 0.9)',   // 에메랄드
        'rgba(196, 181, 253, 0.9)'   // 연보라
    ];
    
    const hoverColors = [
        'rgba(139, 92, 246, 1)',
        'rgba(236, 72, 153, 1)',
        'rgba(59, 130, 246, 1)',
        'rgba(16, 185, 129, 1)',
        'rgba(245, 158, 11, 1)',
        'rgba(168, 85, 247, 1)',
        'rgba(14, 165, 233, 1)',
        'rgba(249, 115, 22, 1)',
        'rgba(52, 211, 153, 1)',
        'rgba(196, 181, 253, 1)'
    ];
    
    const ctx = canvas.getContext('2d');
    
    // 중앙 텍스트 + 세그먼트 라벨 표시 플러그인
    const centerTextPlugin = {
        id: 'centerText',
        afterDatasetsDraw(chart) {
            const { ctx, chartArea: { width, height } } = chart;
            ctx.save();
            
            const centerX = width / 2;
            const centerY = height / 2;
            
            // 총 매출액 계산
            const totalRevenue = chartSegments.reduce((sum, s) => sum + s.revenue, 0);
            const isMobile = window.innerWidth <= 768;
            
            // 한국식/글로벌 단위 변환
            let revenueText;
            if (currency === 'KRW') {
                // 한국 원화: FMP API는 억원 단위로 반환 (115.59 = 115.59억원)
                const revenueInBillionKRW = totalRevenue; // 이미 억원 단위
                const revenueInTrillionKRW = revenueInBillionKRW / 10000; // 조원으로 변환 (1조 = 10,000억)
                
                if (revenueInTrillionKRW >= 1) {
                    // 1조원 이상
                    revenueText = `${revenueInTrillionKRW.toFixed(1)}조원`;
                } else if (revenueInBillionKRW >= 1) {
                    // 1억원 이상
                    revenueText = `${Math.round(revenueInBillionKRW)}억원`;
                } else {
                    // 1억원 미만
                    revenueText = `${(revenueInBillionKRW * 100).toFixed(0)}백만원`;
                }
            } else {
                // 달러 등: 한국식 단위로 표시
                // FMP API는 백만 달러 단위로 반환 (예: 394328 = 394,328M = $394.3B = $3,943억 달러)
                const currencySymbol = currency === 'USD' ? '$' : currency;
                const revenueInBillionUSD = totalRevenue / 1000; // Billion 달러 단위
                const revenueInHundredMillionUSD = revenueInBillionUSD * 10; // 억 달러 단위 (1B = 10억)
                
                if (revenueInHundredMillionUSD >= 10000) {
                    // 1조 달러 이상 (10,000억 달러)
                    revenueText = `${currencySymbol}${(revenueInHundredMillionUSD / 10000).toFixed(1)}조`;
                } else if (revenueInHundredMillionUSD >= 1) {
                    // 1억 달러 이상
                    const formatted = Math.round(revenueInHundredMillionUSD).toLocaleString('ko-KR');
                    revenueText = `${currencySymbol}${formatted}억`;
                } else {
                    // 1억 달러 미만
                    const formatted = Math.round(totalRevenue).toLocaleString('ko-KR');
                    revenueText = `${currencySymbol}${formatted}M`;
                }
            }
            
            // 중앙 타이틀
            ctx.font = `bold ${isMobile ? 14 : 14}px Pretendard, -apple-system, sans-serif`;
            ctx.fillStyle = '#8b5cf6';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('총 매출액', centerX, centerY - (isMobile ? 22 : 20));
            
            // 중앙 금액
            ctx.font = `bold ${isMobile ? 18 : 18}px Pretendard, -apple-system, sans-serif`;
            ctx.fillStyle = '#1f2937';
            ctx.fillText(revenueText, centerX, centerY + 3);
            
            // 중앙 부문 수
            ctx.font = `600 ${isMobile ? 13 : 12}px Pretendard, -apple-system, sans-serif`;
            ctx.fillStyle = '#6b7280';
            ctx.fillText(`${chartSegments.length}개 부문`, centerX, centerY + (isMobile ? 26 : 25));
            
            // 라벨은 제거하고 범례만 표시
            
            ctx.restore();
        }
    };
    
    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: vibrantColors.slice(0, chartSegments.length),
                hoverBackgroundColor: hoverColors.slice(0, chartSegments.length),
                borderWidth: 3,
                borderColor: '#ffffff',
                hoverBorderWidth: 4,
                hoverBorderColor: '#ffffff',
                hoverOffset: 12,
                offset: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '65%', // 도넛 두께 조절 (더 두껍게)
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom',
                    align: 'start',
                    labels: {
                        usePointStyle: true,
                        pointStyle: 'circle',
                        padding: window.innerWidth <= 768 ? 10 : 10,
                        font: {
                            size: window.innerWidth <= 768 ? 12 : 12,
                            weight: '600',
                            family: "'Pretendard', -apple-system, sans-serif",
                            lineHeight: window.innerWidth <= 768 ? 1.5 : 1.2
                        },
                        color: '#374151',
                        boxWidth: window.innerWidth <= 768 ? 10 : 10,
                        boxHeight: window.innerWidth <= 768 ? 10 : 10,
                        generateLabels: function(chart) {
                            const data = chart.data;
                            const isMobile = window.innerWidth <= 768;
                            if (data.labels.length && data.datasets.length) {
                                return data.labels.map((label, i) => {
                                    const percentage = chartSegments[i].percentage;
                                    let displayLabel = label;
                                    
                                    // 모바일에서 너무 긴 텍스트는 잘라내기 (여유 있게)
                                    if (isMobile && label.length > 18) {
                                        displayLabel = label.substring(0, 16) + '...';
                                    }
                                    
                                    const fullText = `${displayLabel} (${percentage.toFixed(1)}%)`;
                                    
                                    return {
                                        text: fullText,
                                        fillStyle: data.datasets[0].backgroundColor[i],
                                        strokeStyle: data.datasets[0].borderColor,
                                        lineWidth: 1.5,
                                        hidden: false,
                                        index: i
                                    };
                                });
                            }
                            return [];
                        }
                    }
                },
                tooltip: {
                    enabled: true,
                    backgroundColor: 'rgba(255, 255, 255, 0.98)',
                    titleColor: '#1f2937',
                    bodyColor: '#4b5563',
                    borderColor: 'rgba(139, 92, 246, 0.3)',
                    borderWidth: 2,
                    padding: 16,
                    displayColors: true,
                    boxWidth: 12,
                    boxHeight: 12,
                    usePointStyle: true,
                    titleFont: {
                        size: 15,
                        weight: '700',
                        family: "'Pretendard', -apple-system, sans-serif"
                    },
                    bodyFont: {
                        size: 14,
                        weight: '600',
                        family: "'Pretendard', -apple-system, sans-serif"
                    },
                    cornerRadius: 12,
                    callbacks: {
                        title: function(context) {
                            return chartSegments[context[0].dataIndex].segment;
                        },
                        label: function(context) {
                            const segment = chartSegments[context.dataIndex];
                            const currencySymbol = currency === 'KRW' ? '₩' : (currency === 'USD' ? '$' : currency);
                            const revenue = segment.revenue.toLocaleString();
                            return ` ${currencySymbol}${revenue} (${segment.percentage.toFixed(1)}%)`;
                        }
                    }
                }
            },
            animation: {
                animateRotate: true,
                animateScale: true,
                duration: 1500,
                easing: 'easeInOutQuart'
            },
            interaction: {
                intersect: false,
                mode: 'index'
            }
        },
        plugins: [centerTextPlugin]
    });
}

// 재무제표 차트 렌더링
function renderFinancialChart(canvasId, chartData, currency = 'KRW') {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !chartData || chartData.length === 0) {
        if (chartInstances[canvasId]) {
            chartInstances[canvasId].destroy();
            delete chartInstances[canvasId];
        }
        return;
    }
    
    const ctx = canvas.getContext('2d');
    const labels = chartData.map(item => item.year);
    const revenueData = chartData.map(item => item.revenue);
    const operatingIncomeData = chartData.map(item => item.operatingIncome);
    const netIncomeData = chartData.map(item => item.netIncome);
    
    if (chartInstances[canvasId]) {
        chartInstances[canvasId].destroy();
    }

    chartInstances[canvasId] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: '매출액',
                    data: revenueData,
                    backgroundColor: '#8b5cf6',
                    borderColor: '#8b5cf6',
                    borderWidth: 0,
                    borderRadius: 6,
                    yAxisID: 'y'
                },
                {
                    label: '영업이익',
                    data: operatingIncomeData,
                    backgroundColor: '#10b981',
                    borderColor: '#10b981',
                    borderWidth: 0,
                    borderRadius: 6,
                    yAxisID: 'y'
                },
                {
                    label: '당기순이익',
                    data: netIncomeData,
                    backgroundColor: '#f59e0b',
                    borderColor: '#f59e0b',
                    borderWidth: 0,
                    borderRadius: 6,
                    yAxisID: 'y'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: `단위: ${getCurrencyUnitText(currency)}`,
                    align: 'end',
                    font: {
                        size: 13,
                        weight: '700',
                        family: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Noto Sans KR", sans-serif'
                    },
                    color: '#4b5563',
                    padding: {
                        top: 5,
                        bottom: 10
                    }
                },
                legend: {
                    display: true,
                    position: 'bottom',
                    align: 'center',
                    labels: {
                        usePointStyle: true,
                        pointStyle: 'circle',
                        padding: 18,
                        font: {
                            size: 14,
                            weight: '600',
                            family: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Noto Sans KR", sans-serif'
                        },
                        color: '#374151',
                        boxWidth: 14,
                        boxHeight: 14
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.88)',
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    padding: 14,
                    titleFont: {
                        size: 14,
                        weight: '700',
                        family: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Noto Sans KR", sans-serif'
                    },
                    bodyFont: {
                        size: 13,
                        weight: '600',
                        family: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Noto Sans KR", sans-serif'
                    },
                    borderColor: 'rgba(139, 92, 246, 0.3)',
                    borderWidth: 1,
                    cornerRadius: 10,
                    displayColors: true,
                    boxWidth: 12,
                    boxHeight: 12,
                    callbacks: {
                        label: function(context) {
                            return context.dataset.label + ': ' + formatNumberInHundredMillion(context.parsed.y, currency);
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: false
                    },
                    grid: {
                        color: 'rgba(139, 92, 246, 0.08)',
                        drawBorder: false,
                        lineWidth: 1
                    },
                    ticks: {
                        callback: function(value) {
                            return formatNumberForChartAxis(value);
                        },
                        font: {
                            size: 12,
                            weight: '600',
                            family: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Noto Sans KR", sans-serif'
                        },
                        color: '#4b5563',
                        padding: 10
                    }
                },
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        maxRotation: 0,
                        minRotation: 0,
                        autoSkip: false,
                        font: {
                            size: 12,
                            weight: '600',
                            family: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Noto Sans KR", sans-serif'
                        },
                        color: '#6b7280',
                        padding: 10
                    }
                }
            },
            barPercentage: 0.7,
            categoryPercentage: 0.8,
            layout: {
                padding: {
                    bottom: 10
                }
            }
        }
    });
}

// 관련종목 정보 추가 (피어그룹, 서플라이체인)
function addFavoriteStockInfo(symbol, companyName) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message bot-message';
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content stock-content';
    
    // 고유 ID 생성
    const favoriteBodyId = `favorite-body-${symbol}-${Date.now()}`;
    
    // 임시 데이터 (나중에 API로 교체)
    const favoriteData = getFavoriteMockData(symbol, companyName);
    
    // 피어그룹 HTML 생성
    const hasPeerGroupData = Object.keys(favoriteData.peerGroup).length > 0;
    
    let peerGroupHtml = '';
    if (!hasPeerGroupData) {
        if (lastVisionResult?.related_public_companies && lastVisionResult.related_public_companies.length > 0) {
            peerGroupHtml = `<div class="vision-enrichment-section">
                <h5 style="margin-bottom: 12px;">🔎 제품 관련 상장사</h5>
                <div class="related-companies-list">
                    ${lastVisionResult.related_public_companies.map((comp, idx) => `
                        <div class="peer-item">
                            <div class="peer-info-row">
                                <span class="peer-name">${idx + 1}. ${comp.company || '-'}</span>
                                <span class="peer-ticker">${comp.ticker || '-'} (${comp.market || '-'})</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>`;
        } else {
            peerGroupHtml = '<div class="no-data-message">해당 종목의 피어그룹 데이터가 준비되지 않았습니다.</div>';
        }
    } else {
        peerGroupHtml = Object.entries(favoriteData.peerGroup).map(([companyName, categories]) => `
            <div class="peer-company-group">
                <div class="peer-company-header">
                    <h5 class="peer-company-name">${companyName}</h5>
                </div>
                ${categories.map(categoryData => `
                    <div class="peer-category-section">
                        <div class="peer-category-title">${categoryData.category}</div>
                        <div class="peer-competitors">
                            ${categoryData.competitors.map(comp => `
                                <div class="peer-item">
                                    <div class="peer-info-row">
                                        <span class="peer-name">${comp.name}</span>
                                        <span class="peer-ticker">${comp.ticker} (${comp.market})</span>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `).join('')}
            </div>
        `).join('');
    }
    
    contentDiv.innerHTML = `
        <div class="favorite-info">
            <div class="favorite-header-container">
                <h3 class="favorite-main-title">${companyName} 관련종목 분석</h3>
                <button class="favorite-collapse-btn" data-target="${favoriteBodyId}">접기</button>
            </div>
            
            <div id="${favoriteBodyId}" class="favorite-body">
            
            ${favoriteData.hasValueChain ? `
            <!-- 탭 메뉴 -->
            <div class="value-chain-tabs">
                <button class="vc-tab-btn active" data-tab="peer-group">피어그룹</button>
                <button class="vc-tab-btn" data-tab="value-chain">밸류체인</button>
            </div>
            ` : ''}
            
            <!-- 피어그룹 섹션 -->
            <div class="vc-tab-content active" data-content="peer-group">
            <div class="favorite-section peer-group-section">
                <div class="favorite-section-header">
                    <span class="favorite-icon">👥</span>
                    <h4>동종 업계 (Peer Group)</h4>
                </div>
                <p class="favorite-description">같은 산업군에 속한 주요 경쟁사들입니다.</p>
                <div class="peer-group-list">
                    ${peerGroupHtml}
                </div>
            </div>
            </div>
            
            <!-- 밸류체인 섹션 -->
            ${favoriteData.hasValueChain ? `
            <div class="vc-tab-content" data-content="value-chain">
            <div class="favorite-section value-chain-section">
                <div class="favorite-section-header">
                    <span class="favorite-icon">🔗</span>
                    <h4>밸류체인 (Value Chain)</h4>
                </div>
                <p class="favorite-description">공급망과 판매 네트워크를 확인하세요.</p>
                <div class="value-chain-list">
                    ${Object.keys(favoriteData.valueChain).length === 0 ? 
                        '<div class="no-data-message">해당 종목의 밸류체인 데이터가 준비되지 않았습니다.</div>' :
                        Object.entries(favoriteData.valueChain).map(([industry, relationships]) => `
                        <div class="vc-industry-group">
                            <div class="vc-industry-header">
                                <h5 class="vc-industry-name">${industry}</h5>
                            </div>
                            ${Object.entries(relationships).map(([relType, categories]) => `
                                <div class="vc-relationship-section">
                                    <div class="vc-relationship-title">${relType}</div>
                                    ${Object.entries(categories).map(([catName, companies]) => `
                                        ${catName ? `<div class="vc-category-label">${catName}</div>` : ''}
                                        <div class="vc-companies">
                                            ${companies.map(comp => `
                                                <div class="peer-item">
                                                    <div class="peer-info-row">
                                                        <span class="peer-name">${comp.name}</span>
                                                        ${comp.ticker ? `<span class="peer-ticker">${comp.ticker} (${comp.market})</span>` : ''}
                                                    </div>
                                                </div>
                                            `).join('')}
                                        </div>
                                    `).join('')}
                                </div>
                            `).join('')}
                        </div>
                    `).join('')}
                </div>
            </div>
            </div>
            ` : ''}
            
            <!-- 서플라이체인 섹션 (데이터가 있을 때만 표시) -->
            ${favoriteData.supplyChain.suppliers.length > 0 || favoriteData.supplyChain.customers.length > 0 ? `
            <div class="favorite-section supply-chain-section">
                <div class="favorite-section-header">
                    <span class="favorite-icon">🔗</span>
                    <h4>공급망 (Supply Chain)</h4>
                </div>
                <p class="favorite-description">주요 협력사 및 공급망 관계에 있는 기업들입니다.</p>
                
                ${favoriteData.supplyChain.suppliers.length > 0 ? `
                <div class="supply-chain-category">
                    <h5 class="supply-category-title">📦 주요 공급사</h5>
                    <div class="supply-chain-list">
                        ${favoriteData.supplyChain.suppliers.map(supplier => `
                            <div class="supply-item">
                                <div class="supply-header">
                                    <span class="supply-name">${supplier.name}</span>
                                    <span class="supply-badge">${supplier.category}</span>
                                </div>
                                <div class="supply-description">${supplier.description}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
                ` : ''}
                
                ${favoriteData.supplyChain.customers.length > 0 ? `
                <div class="supply-chain-category">
                    <h5 class="supply-category-title">🏭 주요 고객사</h5>
                    <div class="supply-chain-list">
                        ${favoriteData.supplyChain.customers.map(customer => `
                            <div class="supply-item">
                                <div class="supply-header">
                                    <span class="supply-name">${customer.name}</span>
                                    <span class="supply-badge">${customer.category}</span>
                                </div>
                                <div class="supply-description">${customer.description}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
                ` : ''}
            </div>
            ` : ''}
            
            <div style="margin-top:16px; text-align:right;">
                <button class="scroll-to-main-btn" data-symbol="${symbol}">⬆️ 메인카드로 이동</button>
            </div>
            </div>
        </div>
    `;
    
    messageDiv.appendChild(contentDiv);
    chatMessages.appendChild(messageDiv);
    
    // 접기/펼치기 토글
    setTimeout(() => {
        const collapseBtn = contentDiv.querySelector('.favorite-collapse-btn');
        const bodyEl = document.getElementById(favoriteBodyId);
        if (collapseBtn && bodyEl) {
            collapseBtn.addEventListener('click', () => {
                const isHidden = bodyEl.style.display === 'none';
                if (isHidden) {
                    bodyEl.style.display = '';
                    collapseBtn.textContent = '접기';
                } else {
                    bodyEl.style.display = 'none';
                    collapseBtn.textContent = '펼치기';
                }
            });
        }
        
        // 탭 전환 이벤트 리스너
        const tabButtons = contentDiv.querySelectorAll('.vc-tab-btn');
        const tabContents = contentDiv.querySelectorAll('.vc-tab-content');
        
        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const targetTab = button.dataset.tab;
                
                // 모든 탭 버튼에서 active 제거
                tabButtons.forEach(btn => btn.classList.remove('active'));
                // 클릭한 탭에 active 추가
                button.classList.add('active');
                
                // 모든 탭 콘텐츠 숨기기
                tabContents.forEach(content => content.classList.remove('active'));
                // 선택한 탭 콘텐츠만 표시
                const targetContent = contentDiv.querySelector(`[data-content="${targetTab}"]`);
                if (targetContent) {
                    targetContent.classList.add('active');
                }
            });
        });
        
        // 메인카드로 이동 버튼 이벤트 리스너
        const scrollToMainBtn = contentDiv.querySelector('.scroll-to-main-btn');
        if (scrollToMainBtn) {
            scrollToMainBtn.addEventListener('click', () => {
                const symbol = scrollToMainBtn.dataset.symbol;
                scrollToMainCard(symbol);
            });
        }
        
        // 카드 타이틀이 보이도록 스크롤
        const favoriteTitle = contentDiv.querySelector('.favorite-main-title');
        if (favoriteTitle) {
            const titleTop = messageDiv.offsetTop + favoriteTitle.offsetTop;
            const offset = 80; // 충분한 여유 공간
            chatMessages.scrollTo({
                top: titleTop - offset,
                behavior: 'smooth'
            });
        }
    }, 200);
    
    // Lucide 아이콘 초기화
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

// 임시 Mock 데이터 생성 함수
function getFavoriteMockData(symbol, companyName) {
    // 동아소시오홀딩스 (000640.KS)
    if (symbol === '000640' || symbol === '000640.KS' || companyName.includes('동아소시오') || companyName.includes('동아쏘시오')) {
        return {
            hasValueChain: true,
            peerGroup: {
                '동아제약 (000640)': [
                    { 
                        category: '자양강장제/에너지 드링크',
                        competitors: [
                            { name: '광동제약', ticker: '009290', market: 'KOSPI' },
                            { name: '롯데칠성음료', ticker: '005300', market: 'KOSPI' },
                            { name: 'Monster Beverage', ticker: 'MNST', market: 'NASDAQ' }
                        ]
                    },
                    {
                        category: '프리미엄 영양제 유통',
                        competitors: [
                            { name: '헤일리온 ADR', ticker: 'HLN', market: 'NYSE' },
                            { name: '오츠카 홀딩스', ticker: '4578', market: 'TSE' },
                            { name: '네슬레', ticker: 'NESN', market: 'SIX' }
                        ]
                    }
                ],
                '동아ST (170900)': [
                    {
                        category: '전문의약·신약/개량신약',
                        competitors: [
                            { name: '유한양행', ticker: '000100', market: 'KOSPI' },
                            { name: '한미약품', ticker: '128940', market: 'KOSPI' },
                            { name: '대웅제약', ticker: '069620', market: 'KOSPI' },
                            { name: '종근당', ticker: '185750', market: 'KOSPI' }
                        ]
                    },
                    {
                        category: '바이오시밀러',
                        competitors: [
                            { name: '삼성바이오로직스', ticker: '207940', market: 'KOSPI' },
                            { name: '셀트리온', ticker: '068270', market: 'KOSPI' },
                            { name: '암젠', ticker: 'AMGN', market: 'NASDAQ' },
                            { name: '알보테크', ticker: 'ALVOF', market: 'OTC' },
                            { name: '테바제약', ticker: 'TEVA', market: 'NYSE' }
                        ]
                    }
                ],
                '에스티팜': [
                    {
                        category: '항체 바이오 의약품 CDMO',
                        competitors: [
                            { name: '노보 노디스크', ticker: 'NVO', market: 'NYSE' },
                            { name: '삼성바이오로직스', ticker: '207940', market: 'KOSPI' }
                        ]
                    }
                ],
                '동아오츠카': [
                    {
                        category: '스포츠/이온음료',
                        competitors: [
                            { name: '펩시코', ticker: 'PEP', market: 'NASDAQ' },
                            { name: '코카콜라', ticker: 'KO', market: 'NYSE' },
                            { name: '롯데칠성음료', ticker: '005300', market: 'KOSPI' }
                        ]
                    }
                ],
                '용마로지스': [
                    {
                        category: '헬스케어 콜드체인 물류',
                        competitors: [
                            { name: 'CJ대한통운', ticker: '000120', market: 'KOSPI' },
                            { name: 'LX인터내셔널', ticker: '001120', market: 'KOSPI' },
                            { name: '롯데지주', ticker: '004990', market: 'KOSPI' },
                            { name: '현대글로비스', ticker: '086280', market: 'KOSPI' }
                        ]
                    }
                ],
                '동아에코팩': [
                    {
                        category: '유리·PET병/마개 패키징',
                        competitors: [
                            { name: '삼양패키징', ticker: '272550', market: 'KOSDAQ' },
                            { name: '동원시스템즈', ticker: '014820', market: 'KOSPI' },
                            { name: '삼화왕관', ticker: '004720', market: 'KOSPI' }
                        ]
                    }
                ]
            },
            valueChain: {
                '의약품': {
                    '공급처': {
                        '원료 (고과당 등 액체의약품)': [
                            { name: '삼양사', ticker: '145990', market: 'KOSPI' }
                        ],
                        '포장용기 (PET병 재료)': [
                            { name: '롯데케미칼', ticker: '011170', market: 'KOSPI' }
                        ]
                    },
                    '유통채널 (편의점)': {
                        '': [
                            { name: 'BGF리테일', ticker: '027410', market: 'KOSPI' },
                            { name: 'GS리테일', ticker: '007070', market: 'KOSPI' },
                            { name: '롯데지주', ticker: '004990', market: 'KOSPI' },
                            { name: '이마트', ticker: '139480', market: 'KOSPI' }
                        ]
                    }
                }
            },
            supplyChain: {
                suppliers: [],
                customers: []
            }
        };
    }
    
    // 에이피알 (278470)
    if (symbol === '278470' || symbol === '278470.KS' || companyName.includes('에이피알') || companyName.includes('APR')) {
        return {
            hasValueChain: true,
            peerGroup: {
                '화장품 제조업': [
                    {
                        category: '주요 경쟁사',
                        competitors: [
                            { name: '아모레퍼시픽', ticker: '090430', market: 'KOSPI' },
                            { name: 'LG생활건강', ticker: '051900', market: 'KOSPI' },
                            { name: '달바글로벌', ticker: '448810', market: 'KOSDAQ' },
                            { name: '코스메카코리아', ticker: '241840', market: 'KOSDAQ' },
                            { name: '아이패밀리에스씨', ticker: '298690', market: 'KOSDAQ' },
                            { name: '네오팜', ticker: '092730', market: 'KOSDAQ' },
                            { name: '마녀공장', ticker: '434920', market: 'KOSDAQ' },
                            { name: '클리오', ticker: '237880', market: 'KOSDAQ' },
                            { name: '에이블씨앤씨', ticker: '078520', market: 'KOSDAQ' },
                            { name: '토니모리', ticker: '214420', market: 'KOSDAQ' },
                            { name: '제닉', ticker: '123330', market: 'KOSDAQ' },
                            { name: '한국화장품', ticker: '192820', market: 'KOSDAQ' }
                        ]
                    }
                ]
            },
            valueChain: {
                '화학소재': {
                    '공급처 (소재)': {
                        '': [
                            { name: '한국콜마', ticker: '161890', market: 'KOSPI' },
                            { name: '코스맥스', ticker: '192820', market: 'KOSPI' }
                        ]
                    },
                    '유통채널': {
                        '': [
                            { name: '실리콘투', ticker: '203650', market: 'KOSDAQ' }
                        ]
                    }
                }
            },
            supplyChain: {
                suppliers: [],
                customers: []
            }
        };
    }
    
    // Apple (AAPL)
    if (symbol === 'AAPL' || companyName.includes('Apple') || companyName.includes('애플')) {
        return {
            hasValueChain: true,
            peerGroup: {
                '스마트폰 (iPhone)': [
                    {
                        category: '주요 경쟁사',
                        competitors: [
                            { name: '삼성전자', ticker: '005930', market: 'KOSPI' },
                            { name: 'Google (Alphabet)', ticker: 'GOOGL', market: 'NASDAQ' }
                        ]
                    }
                ],
                'PC/노트북·데스크톱': [
                    {
                        category: '주요 경쟁사',
                        competitors: [
                            { name: 'HP', ticker: 'HPQ', market: 'NYSE' },
                            { name: 'Dell', ticker: 'DELL', market: 'NYSE' },
                            { name: 'Microsoft', ticker: 'MSFT', market: 'NASDAQ' }
                        ]
                    }
                ],
                '태블릿 (iPad)': [
                    {
                        category: '주요 경쟁사',
                        competitors: [
                            { name: '삼성전자', ticker: '005930', market: 'KOSPI' },
                            { name: 'Amazon', ticker: 'AMZN', market: 'NASDAQ' },
                            { name: 'Microsoft', ticker: 'MSFT', market: 'NASDAQ' }
                        ]
                    }
                ],
                '스마트워치·웨어러블': [
                    {
                        category: '주요 경쟁사',
                        competitors: [
                            { name: '삼성전자', ticker: '005930', market: 'KOSPI' },
                            { name: 'Garmin', ticker: 'GRMN', market: 'NASDAQ' },
                            { name: 'Google (Alphabet)', ticker: 'GOOGL', market: 'NASDAQ' }
                        ]
                    }
                ],
                '헤드셋/공간컴퓨팅 (AR/VR)': [
                    {
                        category: '주요 경쟁사',
                        competitors: [
                            { name: '삼성전자', ticker: '005930', market: 'KOSPI' },
                            { name: 'Meta', ticker: 'META', market: 'NASDAQ' },
                            { name: 'Microsoft', ticker: 'MSFT', market: 'NASDAQ' },
                            { name: 'Sony', ticker: 'SONY', market: 'NYSE' }
                        ]
                    }
                ],
                '앱 스토어 & 디지털 콘텐츠': [
                    {
                        category: '앱마켓/플랫폼',
                        competitors: [
                            { name: 'Google (Alphabet)', ticker: 'GOOGL', market: 'NASDAQ' },
                            { name: '삼성전자', ticker: '005930', market: 'KOSPI' }
                        ]
                    },
                    {
                        category: '모바일 게임 구독',
                        competitors: [
                            { name: 'Microsoft', ticker: 'MSFT', market: 'NASDAQ' },
                            { name: 'Sony', ticker: 'SONY', market: 'NYSE' }
                        ]
                    }
                ],
                '음악 및 오디오': [
                    {
                        category: '주요 경쟁사',
                        competitors: [
                            { name: 'Spotify', ticker: 'SPOT', market: 'NYSE' },
                            { name: 'Google (Alphabet)', ticker: 'GOOGL', market: 'NASDAQ' },
                            { name: 'Amazon', ticker: 'AMZN', market: 'NASDAQ' }
                        ]
                    }
                ],
                '비디오 (Apple TV+)': [
                    {
                        category: '주요 경쟁사',
                        competitors: [
                            { name: 'Netflix', ticker: 'NFLX', market: 'NASDAQ' },
                            { name: 'Disney', ticker: 'DIS', market: 'NYSE' },
                            { name: 'Amazon', ticker: 'AMZN', market: 'NASDAQ' },
                            { name: 'Google (Alphabet)', ticker: 'GOOGL', market: 'NASDAQ' }
                        ]
                    }
                ],
                '클라우드 서비스 (iCloud)': [
                    {
                        category: '주요 경쟁사',
                        competitors: [
                            { name: 'Microsoft', ticker: 'MSFT', market: 'NASDAQ' },
                            { name: 'Google (Alphabet)', ticker: 'GOOGL', market: 'NASDAQ' },
                            { name: 'Dropbox', ticker: 'DBX', market: 'NASDAQ' }
                        ]
                    }
                ],
                'Advertising': [
                    {
                        category: '주요 경쟁사',
                        competitors: [
                            { name: 'Google (Alphabet)', ticker: 'GOOGL', market: 'NASDAQ' },
                            { name: 'Meta', ticker: 'META', market: 'NASDAQ' },
                            { name: 'Amazon', ticker: 'AMZN', market: 'NASDAQ' },
                            { name: 'Microsoft', ticker: 'MSFT', market: 'NASDAQ' }
                        ]
                    }
                ],
                '결제 서비스 (Apple Pay/Card)': [
                    {
                        category: '주요 경쟁사',
                        competitors: [
                            { name: 'Google (Alphabet)', ticker: 'GOOGL', market: 'NASDAQ' },
                            { name: '삼성전자', ticker: '005930', market: 'KOSPI' },
                            { name: 'PayPal', ticker: 'PYPL', market: 'NASDAQ' },
                            { name: 'Block (Square)', ticker: 'SQ', market: 'NYSE' }
                        ]
                    }
                ]
            },
            valueChain: {
                '반도체': {
                    '공급처 - 메모리(Mobile)': {
                        '': [
                            { name: '삼성전자', ticker: '005930', market: 'KOSPI' },
                            { name: 'SK하이닉스', ticker: '000660', market: 'KOSPI' }
                        ]
                    },
                    '공급처 - Chips': {
                        '': [
                            { name: 'TSMC(ADR)', ticker: 'TSM', market: 'NYSE' },
                            { name: '퀄컴', ticker: 'QCOM', market: 'NASDAQ' },
                            { name: '브로드컴', ticker: 'AVGO', market: 'NASDAQ' }
                        ]
                    },
                    '공급처 - OLED 패널': {
                        '': [
                            { name: '삼성전자', ticker: '005930', market: 'KOSPI' },
                            { name: 'LG디스플레이', ticker: '034220', market: 'KOSPI' }
                        ]
                    },
                    '공급처 - 기타 부품': {
                        '': [
                            { name: 'LG이노텍', ticker: '011070', market: 'KOSPI' },
                            { name: '자벨', ticker: 'JBL', market: 'NYSE' }
                        ]
                    }
                },
                '전자제품': {
                    '판매처 - 리테일/유통·통신': {
                        '': [
                            { name: 'Best Buy', ticker: 'BBY', market: 'NYSE' },
                            { name: 'AT&T', ticker: 'T', market: 'NYSE' },
                            { name: 'Verizon', ticker: 'VZ', market: 'NYSE' },
                            { name: 'T-Mobile US', ticker: 'TMUS', market: 'NASDAQ' },
                            { name: 'SK텔레콤', ticker: '017670', market: 'KOSPI' },
                            { name: 'KT', ticker: '030200', market: 'KOSPI' }
                        ]
                    }
                },
                '게임': {
                    '공급처 - 모바일': {
                        '': [
                            { name: '더블유게임즈', ticker: '192080', market: 'KOSDAQ' },
                            { name: '네오위즈', ticker: '095660', market: 'KOSDAQ' },
                            { name: '데브시스터즈', ticker: '194480', market: 'KOSDAQ' }
                        ]
                    }
                },
                '콘텐츠': {
                    '공급처': {
                        '': [
                            { name: 'CJ ENM', ticker: '035760', market: 'KOSPI' },
                            { name: '디어유', ticker: '376300', market: 'KOSDAQ' },
                            { name: '폴라리스오피스', ticker: '041920', market: 'KOSDAQ' }
                        ]
                    }
                }
            },
            supplyChain: {
                suppliers: [],
                customers: []
            }
        };
    }
    
    // 기본 템플릿 (데이터 없는 경우)
    return {
        hasValueChain: false,
        peerGroup: {},
        valueChain: {},
        supplyChain: {
            suppliers: [],
            customers: []
        }
    };
}

// 뉴스 메시지 추가
function addNewsMessage(companyName, symbol, newsList) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message bot-message';
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content stock-content';
    
    // 고유 ID 생성
    const newsBodyId = `news-body-${symbol}-${Date.now()}`;
    
    const newsSection = document.createElement('div');
    newsSection.className = 'news-section';
    newsSection.innerHTML = `
        <div class="news-header-container">
        <h4 class="news-title">📰 ${companyName} 최신 뉴스</h4>
            <button class="news-collapse-btn" data-target="${newsBodyId}">접기</button>
        </div>
        <div id="${newsBodyId}" class="news-body">
        <div class="news-list">
            ${newsList.map((item) => `
                <div class="news-item">
                    <div class="news-header">
                        <span class="news-site">${item.site || ''}</span>
                        <span class="news-date">${item.date || ''}</span>
                    </div>
                    <div class="news-content">
                        <a href="${item.url}" target="_blank" class="news-link">
                            <strong>${item.title || '제목 없음'}</strong>
                        </a>
                        ${item.summary ? `<p class="news-summary">${item.summary}</p>` : ''}
                    </div>
                </div>
            `).join('')}
            </div>
            <div style="margin-top:16px; text-align:right;">
                <button class="scroll-to-main-btn" data-symbol="${symbol}">⬆️ 메인카드로 이동</button>
            </div>
        </div>
    `;
    
    contentDiv.appendChild(newsSection);
    messageDiv.appendChild(contentDiv);
    chatMessages.appendChild(messageDiv);
    
    // 접기/펼치기 토글
    setTimeout(() => {
        const collapseBtn = newsSection.querySelector('.news-collapse-btn');
        const bodyEl = document.getElementById(newsBodyId);
        if (collapseBtn && bodyEl) {
            collapseBtn.addEventListener('click', () => {
                const isHidden = bodyEl.style.display === 'none';
                if (isHidden) {
                    bodyEl.style.display = '';
                    collapseBtn.textContent = '접기';
                } else {
                    bodyEl.style.display = 'none';
                    collapseBtn.textContent = '펼치기';
                }
            });
        }
        
        // 메인카드로 이동 버튼 이벤트 리스너
        const scrollToMainBtn = newsSection.querySelector('.scroll-to-main-btn');
        if (scrollToMainBtn) {
            scrollToMainBtn.addEventListener('click', () => {
                const symbol = scrollToMainBtn.dataset.symbol;
                scrollToMainCard(symbol);
            });
        }
        
        // 카드 타이틀이 보이도록 스크롤
        const newsTitle = newsSection.querySelector('.news-title');
        if (newsTitle) {
            const titleTop = messageDiv.offsetTop + newsTitle.offsetTop;
            const offset = 80; // 충분한 여유 공간
            chatMessages.scrollTo({
                top: titleTop - offset,
                behavior: 'smooth'
            });
        }
    }, 200);
}

// 메인카드로 스크롤하는 함수
function scrollToMainCard(symbol) {
    const mainCard = document.querySelector(`[data-main-card="true"][data-symbol="${symbol}"]`);
    if (mainCard) {
        // 카드의 위쪽에 충분한 여유 공간을 두고 스크롤
        const cardTop = mainCard.offsetTop;
        const offset = 80; // 위쪽 여유 공간 증가
        chatMessages.scrollTo({
            top: cardTop - offset,
            behavior: 'smooth'
        });
    }
}

// 메시지 추가 함수
function addMessage(text, sender) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}-message`;
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    
    if (typeof text === 'string') {
        contentDiv.textContent = text;
    } else {
        contentDiv.appendChild(text);
    }
    
    messageDiv.appendChild(contentDiv);
    chatMessages.appendChild(messageDiv);
    
    // 스크롤을 맨 아래로
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    return messageDiv;
}

// 로딩 메시지 추가
function addLoadingMessage(text = '답변 중...') {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message bot-message';
    const messageId = `loading-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    messageDiv.id = messageId;
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.textContent = text;
    
    messageDiv.appendChild(contentDiv);
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    return messageId;
}

// 메시지 제거
function removeMessage(id) {
    const element = document.getElementById(id);
    if (element) {
        element.remove();
    }
}

// 여러 종목 선택 버튼 표시
function addStockSelectionButtons(stocks) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message bot-message';
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content stock-selection-content';
    
    const title = document.createElement('div');
    title.className = 'stock-selection-title';
    title.textContent = `검색된 종목 ${stocks.length}개를 선택해주세요:`;
    
    const buttonsContainer = document.createElement('div');
    buttonsContainer.className = 'stock-selection-buttons';
    
    stocks.forEach((stock, index) => {
        const button = document.createElement('button');
        button.className = 'stock-selection-btn';
        button.textContent = `${index + 1}. ${stock}`;
        button.dataset.stock = stock;
        
        button.addEventListener('click', async () => {
            // 버튼 비활성화
            button.disabled = true;
            button.style.opacity = '0.6';
            
            // 로딩 메시지 표시
            const loadingId = addLoadingMessage();
            
            try {
                // 주가 정보 검색
                const stockData = await fetchStockData(stock);
                
                // 로딩 메시지 제거
                removeMessage(loadingId);
                
                if (stockData) {
                    // 주가 정보 표시
                    addStockMessage(stockData);
                } else {
                    addMessage(`"${stock}" 종목을 찾을 수 없습니다.`, 'bot');
                }
            } catch (error) {
                removeMessage(loadingId);
                addMessage('주가 정보를 가져오는 중 오류가 발생했습니다.', 'bot');
                console.error('오류:', error);
            } finally {
                // 버튼 다시 활성화
                button.disabled = false;
                button.style.opacity = '1';
            }
        });
        
        buttonsContainer.appendChild(button);
    });
    
    contentDiv.appendChild(title);
    contentDiv.appendChild(buttonsContainer);
    messageDiv.appendChild(contentDiv);
    chatMessages.appendChild(messageDiv);
    
    // 스크롤을 맨 아래로
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// 주가 정보 메시지 추가
async function addStockMessage(stockData) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message bot-message';
    // 메인카드 식별을 위한 속성 추가
    messageDiv.setAttribute('data-main-card', 'true');
    messageDiv.setAttribute('data-symbol', stockData.symbol);
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content stock-content';
    
    // 주가 정보 표시
    const changeColor = stockData.change >= 0 ? '#e74c3c' : '#3498db';
    const changeIcon = stockData.change >= 0 ? '▲' : '▼';
    
    // 고유 차트 ID 생성
    const chartId = `chart-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const stockInfo = document.createElement('div');
    stockInfo.className = 'stock-info';
    stockInfo.innerHTML = `
        <div class="stock-header">
            <div class="stock-header-left">
            <h3>${stockData.name}</h3>
            <span class="stock-symbol">${stockData.symbol}</span>
            </div>
            <button class="favorite-star-btn" data-symbol="${stockData.symbol}" data-name="${stockData.name}" title="관심 종목 추가">
                <i data-lucide="star" class="star-icon"></i>
            </button>
        </div>
        <div class="stock-price">
            <span class="price">${formatNumber(stockData.price)} ${stockData.currency || ''}</span>
            <span class="change" style="color: ${changeColor}">
                ${changeIcon} ${formatNumber(Math.abs(stockData.change))} 
                (${stockData.changePercent >= 0 ? '+' : ''}${stockData.changePercent.toFixed(2)}%)
            </span>
        </div>
        <div class="stock-details">
            <div class="detail-item">
                <span>시가</span>
                <span>${formatNumber(stockData.open || '-')}</span>
            </div>
            <div class="detail-item">
                <span>고가</span>
                <span>${formatNumber(stockData.high || '-')}</span>
            </div>
            <div class="detail-item">
                <span>저가</span>
                <span>${formatNumber(stockData.low || '-')}</span>
            </div>
            <div class="detail-item">
                <span>거래량</span>
                <span>${formatNumber(stockData.volume || '-')}</span>
            </div>
        </div>
        <div class="chart-container">
            <canvas id="${chartId}"></canvas>
        </div>
        <div class="stock-actions">
            <button class="action-btn financial-btn" data-symbol="${stockData.symbol}">
                재무제표
            </button>
            <button class="action-btn news-btn" data-symbol="${stockData.symbol}">
                뉴스
            </button>
            <button class="action-btn favorite-btn" data-symbol="${stockData.symbol}" data-company="${stockData.name}">
                관련종목
            </button>
        </div>
    `;
    
    contentDiv.appendChild(stockInfo);
    messageDiv.appendChild(contentDiv);
    chatMessages.appendChild(messageDiv);
    
    // Lucide 아이콘 초기화
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
    
    // 별 버튼 이벤트 리스너 추가
    const starBtn = stockInfo.querySelector('.favorite-star-btn');
    if (starBtn) {
        // 초기 상태 체크 (localStorage 확인)
        if (checkIfFavorite(stockData.symbol)) {
            starBtn.classList.add('active');
            starBtn.title = '관심 종목 해제';
        }
        
        starBtn.addEventListener('click', (e) => {
            e.preventDefault();
            toggleFavorite(starBtn, stockData.symbol, stockData.name);
        });
    }
    
    // 버튼 이벤트 리스너 추가
    const financialBtn = stockInfo.querySelector('.financial-btn');
    const newsBtn = stockInfo.querySelector('.news-btn');
    const favoriteBtn = stockInfo.querySelector('.favorite-btn');
    
    if (favoriteBtn) {
        favoriteBtn.addEventListener('click', () => {
            // 사용자 메시지 먼저 표시
            addMessage('관련종목', 'user');
            
            // 관련종목 정보 표시 (피어그룹, 서플라이체인)
            addFavoriteStockInfo(stockData.symbol, stockData.name);
        });
    }
    
    if (financialBtn) {
        financialBtn.addEventListener('click', async () => {
            // 사용자 메시지 먼저 표시
            addMessage('재무제표', 'user');
            
            // 버튼 비활성화
            financialBtn.disabled = true;
            financialBtn.style.opacity = '0.6';
            financialBtn.textContent = '재무제표 로딩 중...';
            
            try {
                const financialData = await fetchStockFinancials(stockData.symbol);
                
                if (financialData && financialData.chartData && financialData.chartData.length > 0) {
                    addFinancialMessage(stockData.name, stockData.symbol, financialData);
                } else {
                    addMessage(`${stockData.name}의 재무제표 데이터를 찾을 수 없습니다.`, 'bot');
                }
            } catch (error) {
                console.error('재무제표 조회 오류:', error);
                addMessage('재무제표를 가져오는 중 오류가 발생했습니다.', 'bot');
            } finally {
                // 버튼 다시 활성화
                financialBtn.disabled = false;
                financialBtn.style.opacity = '1';
                financialBtn.textContent = '재무제표';
            }
        });
    }
    
    if (newsBtn) {
        newsBtn.addEventListener('click', async () => {
            // 사용자 메시지 먼저 표시
            addMessage('뉴스', 'user');
            
            // 버튼 비활성화
            newsBtn.disabled = true;
            newsBtn.style.opacity = '0.6';
            newsBtn.textContent = '뉴스 로딩 중...';
            
            try {
                const newsData = await fetchStockNews(stockData.symbol);
                
                if (newsData && newsData.news && newsData.news.length > 0) {
                    addNewsMessage(stockData.name, stockData.symbol, newsData.news);
                } else {
                    addMessage(`${stockData.name}에 대한 뉴스를 찾을 수 없습니다.`, 'bot');
                }
            } catch (error) {
                console.error('뉴스 조회 오류:', error);
                addMessage('뉴스를 가져오는 중 오류가 발생했습니다.', 'bot');
            } finally {
                // 버튼 다시 활성화
                newsBtn.disabled = false;
                newsBtn.style.opacity = '1';
                newsBtn.textContent = '뉴스';
            }
        });
    }
    
    // 차트 로드
    setTimeout(async () => {
        const chartData = await fetchChartData(stockData.symbol, '1m');
        if (chartData && chartData.data) {
            renderChart(chartId, chartData);
        }
    }, 100);
    
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// 차트 렌더링

// 영업이익 상세 카드 추가
function addOperatingIncomeCard(companyName, symbol, financialSectionId) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message bot-message';
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content financial-detail-card';
    contentDiv.style.background = 'linear-gradient(135deg, #e9d5ff 0%, #ddd6fe 100%)'; // 보라색 배경
    
    // 작은 그래프를 위한 캔버스 ID 생성
    const miniChartId = `operating-mini-chart-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    contentDiv.innerHTML = `
        <div class="financial-detail-header">
            <h3 class="financial-detail-title">${companyName} 영업이익</h3>
            <div class="financial-detail-mini-chart">
                <canvas id="${miniChartId}"></canvas>
            </div>
        </div>
        <div class="financial-detail-summary">
            최근 3년간 영업이익이 증가하고 있어요.
        </div>
        <div class="financial-detail-question">
            왜 증가했나요?
        </div>
        <div class="financial-detail-reasons">
            <div class="financial-detail-reason-item">• 본업에서 실제로 남는 돈이 증가하는 중</div>
            <div class="financial-detail-reason-item">• 비용 관리 개선 → 수익성 상승</div>
            <div class="financial-detail-reason-item">• 매출 증가와 함께 이익도 성장하는 구조</div>
        </div>
        <div class="financial-detail-more">
            더 자세히 보시겠어요?
        </div>
        <button class="financial-detail-btn" data-type="operating-detail" data-company="${companyName}" data-symbol="${symbol}">영업이익 상세 보기</button>
        <div style="margin-top:12px; text-align:right;">
            <button class="financial-back-btn" data-target="${financialSectionId}">⬅ 재무제표로 돌아가기</button>
        </div>
    `;
    
    messageDiv.appendChild(contentDiv);
    chatMessages.appendChild(messageDiv);
    
    // 작은 그래프 렌더링 (우상향 추세)
    setTimeout(() => {
        renderMiniOperatingChart(miniChartId);
    }, 100);
    
    // 상세 보기 버튼 이벤트 리스너
    const detailBtn = contentDiv.querySelector('.financial-detail-btn');
    if (detailBtn) {
        detailBtn.addEventListener('click', () => {
            console.log('영업이익 상세 보기 클릭:', companyName, symbol);
            // TODO: 상세 정보 표시
        });
    }
    const backBtnOp = contentDiv.querySelector('.financial-back-btn');
    if (backBtnOp) {
        backBtnOp.addEventListener('click', () => {
            const targetId = backBtnOp.dataset.target;
            const el = document.getElementById(targetId);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                const prevShadow = el.style.boxShadow;
                el.style.transition = 'box-shadow 0.3s';
                el.style.boxShadow = '0 0 0 3px #3b82f6 inset';
                setTimeout(() => { el.style.boxShadow = prevShadow || ''; }, 1200);
            }
        });
    }
    
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// 영업이익 미니 차트 렌더링 (우상향 추세)
function renderMiniOperatingChart(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
        return;
    }
    
    const ctx = canvas.getContext('2d');
    
    // 우상향 추세 데이터 생성
    const labels = ['1년 전', '2년 전', '3년 전'];
    const data = [75, 85, 95]; // 증가 추세
    
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: '영업이익',
                data: data,
                backgroundColor: function(context) {
                    const index = context.dataIndex;
                    if (index === data.length - 1) return '#8b5cf6'; // 끝점 보라색
                    return 'rgba(139, 92, 246, 0.4)'; // 나머지 연한 보라색
                },
                borderColor: '#8b5cf6',
                borderWidth: 0,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    enabled: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    display: false
                },
                x: {
                    display: false
                }
            },
            barPercentage: 0.6,
            categoryPercentage: 0.8
        }
    });
}

// 매출액 상세 카드 추가
function addRevenueCard(companyName, symbol, financialSectionId) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message bot-message';
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content financial-detail-card';
    contentDiv.style.background = 'linear-gradient(135deg, #e9d5ff 0%, #ddd6fe 100%)'; // 보라색 배경
    
    // 작은 그래프를 위한 캔버스 ID 생성
    const miniChartId = `revenue-mini-chart-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    contentDiv.innerHTML = `
        <div class="financial-detail-header">
            <h3 class="financial-detail-title">${companyName} 매출액</h3>
            <div class="financial-detail-mini-chart">
                <canvas id="${miniChartId}"></canvas>
            </div>
        </div>
        <div class="financial-detail-summary">
            최근 3년간 매출액이 증가하고 있어요.
        </div>
        <div class="financial-detail-question">
            왜 증가했나요?
        </div>
        <div class="financial-detail-reasons">
            <div class="financial-detail-reason-item">• 제품 판매가 꾸준히 늘고 있고</div>
            <div class="financial-detail-reason-item">• 해외 매출 비중이 커지고 있으며</div>
            <div class="financial-detail-reason-item">• 브랜드 인지도 상승이 매출을 밀어주고 있어요.</div>
        </div>
        <div class="financial-detail-more">
            더 자세히 보시겠어요?
        </div>
        <button class="financial-detail-btn" data-type="revenue-detail" data-company="${companyName}" data-symbol="${symbol}">매출 상세 보기</button>
        <div style="margin-top:12px; text-align:right;">
            <button class="financial-back-btn" data-target="${financialSectionId}">⬅ 재무제표로 돌아가기</button>
        </div>
    `;
    
    messageDiv.appendChild(contentDiv);
    chatMessages.appendChild(messageDiv);
    
    // 작은 그래프 렌더링 (우상향 추세)
    setTimeout(() => {
        renderMiniRevenueChart(miniChartId);
    }, 100);
    
    // 상세 보기 버튼 이벤트 리스너
    const detailBtn = contentDiv.querySelector('.financial-detail-btn');
    if (detailBtn) {
        detailBtn.addEventListener('click', () => {
            console.log('매출 상세 보기 클릭:', companyName, symbol);
            // TODO: 상세 정보 표시
        });
    }
    const backBtnRev = contentDiv.querySelector('.financial-back-btn');
    if (backBtnRev) {
        backBtnRev.addEventListener('click', () => {
            const targetId = backBtnRev.dataset.target;
            const el = document.getElementById(targetId);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                const prevShadow = el.style.boxShadow;
                el.style.transition = 'box-shadow 0.3s';
                el.style.boxShadow = '0 0 0 3px #3b82f6 inset';
                setTimeout(() => { el.style.boxShadow = prevShadow || ''; }, 1200);
            }
        });
    }
    
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// 매출액 미니 차트 렌더링 (우상향 추세)
function renderMiniRevenueChart(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
        return;
    }
    
    const ctx = canvas.getContext('2d');
    
    // 우상향 추세 데이터 생성
    const labels = ['1년 전', '2년 전', '3년 전'];
    const data = [80, 90, 100]; // 증가 추세
    
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: '매출액',
                data: data,
                backgroundColor: function(context) {
                    const index = context.dataIndex;
                    if (index === data.length - 1) return '#8b5cf6'; // 끝점 보라색
                    return 'rgba(139, 92, 246, 0.4)'; // 나머지 연한 보라색
                },
                borderColor: '#8b5cf6',
                borderWidth: 0,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    enabled: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    display: false
                },
                x: {
                    display: false
                }
            },
            barPercentage: 0.6,
            categoryPercentage: 0.8
        }
    });
}

// 당기순이익 미니 차트 렌더링 (우상향 추세)
function renderMiniNetIncomeChart(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
        return;
    }
    
    const ctx = canvas.getContext('2d');
    
    // 우상향 추세 데이터 생성
    const labels = ['1년 전', '2년 전', '3년 전'];
    const data = [70, 82, 93]; // 증가 추세
    
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: '당기순이익',
                data: data,
                backgroundColor: function(context) {
                    const index = context.dataIndex;
                    if (index === data.length - 1) return '#8b5cf6'; // 끝점 보라색
                    return 'rgba(139, 92, 246, 0.4)'; // 나머지 연한 보라색
                },
                borderColor: '#8b5cf6',
                borderWidth: 0,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    enabled: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    display: false
                },
                x: {
                    display: false
                }
            },
            barPercentage: 0.6,
            categoryPercentage: 0.8
        }
    });
}

// 부채비율 상세 카드 추가
function addDebtRatioCard(companyName, symbol, financialSectionId) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message bot-message';
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content financial-detail-card';
    contentDiv.style.background = 'linear-gradient(135deg, #e9d5ff 0%, #ddd6fe 100%)'; // 보라색 배경
    
    // 작은 그래프를 위한 캔버스 ID 생성
    const miniChartId = `net-income-mini-chart-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    contentDiv.innerHTML = `
        <div class="financial-detail-header">
            <h3 class="financial-detail-title">${companyName} 당기순이익</h3>
            <div class="financial-detail-mini-chart">
                <canvas id="${miniChartId}"></canvas>
            </div>
        </div>
        <div class="financial-detail-summary">
            이 회사의 당기순이익은 전년 대비 증가한 추세로, 안정적인 수익성을 보여주고 있어요.
        </div>
        <div class="financial-detail-question">
            당기순이익이 늘어난 이유는?
        </div>
        <div class="financial-detail-reasons">
            <div class="financial-detail-reason-item">• 매출이 늘면서 영업이익이 개선됐고고</div>
            <div class="financial-detail-reason-item">• 이자비용·법인세 등 비용 부담이 줄었기 때문이에요.</div>
        </div>
        <div class="financial-detail-more">
            더 자세히 보시겠어요?
        </div>
        <button class="financial-detail-btn" data-type="debt-detail" data-company="${companyName}" data-symbol="${symbol}">당기순이익 상세 보기</button>
        <div style="margin-top:12px; text-align:right;">
            <button class="financial-back-btn" data-target="${financialSectionId}">⬅ 재무제표로 돌아가기</button>
        </div>
    `;
    
    messageDiv.appendChild(contentDiv);
    chatMessages.appendChild(messageDiv);
    
    // 작은 그래프 렌더링 (우상향 추세)
    setTimeout(() => {
        renderMiniNetIncomeChart(miniChartId);
    }, 100);
    
    // 상세 보기 버튼 이벤트 리스너
    const detailBtn = contentDiv.querySelector('.financial-detail-btn');
    if (detailBtn) {
        detailBtn.addEventListener('click', () => {
            console.log('부채비율 상세 보기 클릭:', companyName, symbol);
            // TODO: 상세 정보 표시
        });
    }
    const backBtnDebt = contentDiv.querySelector('.financial-back-btn');
    if (backBtnDebt) {
        backBtnDebt.addEventListener('click', () => {
            const targetId = backBtnDebt.dataset.target;
            const el = document.getElementById(targetId);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                const prevShadow = el.style.boxShadow;
                el.style.transition = 'box-shadow 0.3s';
                el.style.boxShadow = '0 0 0 3px #3b82f6 inset';
                setTimeout(() => { el.style.boxShadow = prevShadow || ''; }, 1200);
            }
        });
    }
    
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function renderChart(canvasId, chartData) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !chartData.data || chartData.data.length === 0) {
        return;
    }
    
    const ctx = canvas.getContext('2d');
    const labels = chartData.data.map(item => {
        const date = new Date(item.date);
        return `${date.getMonth() + 1}/${date.getDate()}`;
    });
    const prices = chartData.data.map(item => item.close);
    
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: '종가',
                data: prices,
                borderColor: '#ef4444',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                tension: 0.4,
                fill: true,
                pointRadius: 2,
                pointBackgroundColor: '#ef4444',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointHoverRadius: 6,
                pointHoverBackgroundColor: '#ef4444',
                pointHoverBorderColor: '#fff',
                pointHoverBorderWidth: 3,
                borderWidth: 2.5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    enabled: true,
                    mode: 'index',
                    intersect: false,
                    backgroundColor: 'rgba(0, 0, 0, 0.85)',
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    titleFont: {
                        size: 14,
                        weight: '700',
                        family: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Noto Sans KR", sans-serif'
                    },
                    bodyFont: {
                        size: 13,
                        weight: '600',
                        family: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Noto Sans KR", sans-serif'
                    },
                    padding: 12,
                    cornerRadius: 8,
                    borderColor: 'rgba(239, 68, 68, 0.5)',
                    borderWidth: 2,
                    displayColors: false,
                    callbacks: {
                        label: function(context) {
                            return '종가: ' + formatNumber(context.parsed.y);
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: false,
                    grid: {
                        color: 'rgba(239, 68, 68, 0.08)',
                        drawBorder: false,
                        lineWidth: 1
                    },
                    ticks: {
                        callback: function(value) {
                            return formatNumber(value);
                        },
                        font: {
                            size: 12,
                            weight: '600',
                            family: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Noto Sans KR", sans-serif'
                        },
                        color: '#4b5563',
                        padding: 8
                    }
                },
                x: {
                    grid: {
                        display: true,
                        color: 'rgba(239, 68, 68, 0.12)',
                        drawBorder: false,
                        lineWidth: 1.5
                    },
                    ticks: {
                        maxTicksLimit: 8,
                        maxRotation: 0,
                        minRotation: 0,
                        autoSkip: true,
                        font: {
                            size: 11,
                            weight: '600',
                            family: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Noto Sans KR", sans-serif'
                        },
                        color: '#6b7280',
                        padding: 8
                    }
                }
            }
        }
    });
}

// 숫자 포맷팅
function formatNumber(num) {
    if (num === '-' || num === null || num === undefined) return '-';
    if (typeof num === 'string') return num;
    return num.toLocaleString('ko-KR');
}

// 관심 종목 토글 함수
function toggleFavorite(button, symbol, name) {
    const isFavorite = button.classList.contains('active');
    
    if (isFavorite) {
        // 관심종목 해제
        button.classList.remove('active');
        button.title = '관심 종목 추가';
        
        // localStorage에서 제거
        removeFavoriteFromStorage(symbol);
        
        // 피드백 메시지
        addMessage(`"${name}"을(를) 관심종목에서 제거했습니다.`, 'bot');
    } else {
        // 관심종목 추가
        button.classList.add('active');
        button.title = '관심 종목 해제';
        
        // localStorage에 저장
        addFavoriteToStorage(symbol, name);
        
        // 피드백 메시지
        addMessage(`"${name}"을(를) 관심종목에 추가했습니다! ⭐`, 'bot');
    }
    
    // 아이콘 업데이트
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

// localStorage에 관심 종목 저장
function addFavoriteToStorage(symbol, name) {
    let favorites = JSON.parse(localStorage.getItem('favoriteStocks') || '[]');
    
    // 중복 체크
    if (!favorites.find(f => f.symbol === symbol)) {
        favorites.push({ symbol, name, addedAt: new Date().toISOString() });
        localStorage.setItem('favoriteStocks', JSON.stringify(favorites));
    }
}

// localStorage에서 관심 종목 제거
function removeFavoriteFromStorage(symbol) {
    let favorites = JSON.parse(localStorage.getItem('favoriteStocks') || '[]');
    favorites = favorites.filter(f => f.symbol !== symbol);
    localStorage.setItem('favoriteStocks', JSON.stringify(favorites));
}

// 관심 종목 체크 (페이지 로드 시)
function checkIfFavorite(symbol) {
    const favorites = JSON.parse(localStorage.getItem('favoriteStocks') || '[]');
    return favorites.some(f => f.symbol === symbol);
}

// 억 단위로 포맷팅 (재무제표용)
function formatNumberInHundredMillion(num, currency = 'KRW') {
    if (num === '-' || num === null || num === undefined) return '-';
    if (typeof num === 'string') return num;
    
    // 통화 단위 결정 (통화 기호 없이 뒤에 붙임)
    let unit = '억';
    
    if (currency === 'USD') {
        unit = '억 달러';
    } else if (currency === 'KRW') {
        unit = '억원';
    } else {
        unit = `억 ${currency}`;
    }
    
    const inHundredMillion = num / 100000000; // 억 단위로 변환
    const formatted = inHundredMillion.toLocaleString('ko-KR', { 
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    });
    
    return formatted + unit;
}

// 차트 Y축용 포맷팅 (숫자만)
function formatNumberForChartAxis(num) {
    if (num === '-' || num === null || num === undefined) return '-';
    if (typeof num === 'string') return num;
    
    const inHundredMillion = num / 100000000; // 억 단위로 변환
    return inHundredMillion.toLocaleString('ko-KR', { 
        minimumFractionDigits: 0,
        maximumFractionDigits: 1
    });
}

// 차트 Y축 제목용 단위 텍스트
function getCurrencyUnitText(currency = 'KRW') {
    if (currency === 'USD') {
        return '억 달러';
    } else if (currency === 'KRW') {
        return '억원';
    } else {
        return `억 ${currency}`;
    }
}

// 봇 응답 생성 함수
function getBotResponse(message) {
    const lowerMessage = message.toLowerCase();
    
    // 키워드 매칭
    for (const [keyword, response] of Object.entries(responses)) {
        if (lowerMessage.includes(keyword)) {
            return response;
        }
    }
    
    // 기본 응답
    return '죄송해요, 이해하지 못했어요. 주식 종목명이나 심볼을 입력해주세요.';
}

// DOM 로드 후 초기화
document.addEventListener('DOMContentLoaded', () => {
    // imageUploadInput 먼저 가져오기 (랜딩 페이지와 채팅 페이지 모두에서 사용)
    imageUploadInput = document.getElementById('imageUploadInput');
    
    // 페이지 전환 관련 요소
    const landingPage = document.getElementById('landingPage');
    const chatPage = document.getElementById('chatPage');
    const landingSearchBar = document.getElementById('landingSearchBar');
    const landingCameraFloatingButton = document.getElementById('landingCameraFloatingButton');
    const homeButton = document.getElementById('homeButton');
    
    // 검색바 클릭 시 채팅 페이지로 전환
    if (landingSearchBar) {
        landingSearchBar.addEventListener('click', () => {
            if (landingPage && chatPage) {
                landingPage.style.display = 'none';
                chatPage.style.display = 'flex';
                // 입력창에 포커스
                setTimeout(() => {
                    const userInput = document.getElementById('userInput');
                    if (userInput) {
                        userInput.focus();
                    }
                }, 100);
            }
        });
    }
    
    // 랜딩 페이지 카메라 플로팅 버튼 클릭 시 이미지 선택 모달 열기
    if (landingCameraFloatingButton) {
        landingCameraFloatingButton.addEventListener('click', () => {
            const landingPage = document.getElementById('landingPage');
            const chatPage = document.getElementById('chatPage');
            if (landingPage && chatPage) {
                landingPage.style.display = 'none';
                chatPage.style.display = 'flex';
                // 이미지 선택 모달 열기
                setTimeout(() => {
                    const imageSelectModal = document.getElementById('imageSelectModal');
                    if (imageSelectModal) {
                        imageSelectModal.style.display = 'flex';
                    }
                }, 100);
            }
        });
    }
    
    
    // DOM 요소 선택 (채팅 페이지)
    chatMessages = document.getElementById('chatMessages');
    userInput = document.getElementById('userInput');
    sendButton = document.getElementById('sendButton');
    imageUploadButton = document.getElementById('imageUploadButton');
    
    // 요소가 존재하는지 확인
    if (!chatMessages || !userInput || !sendButton || !imageUploadInput || !imageUploadButton) {
        console.error('필수 DOM 요소를 찾을 수 없습니다.');
        return;
    }
    
    // 이벤트 리스너 등록
    sendButton.addEventListener('click', sendMessage);
    
    // 빠른 액션 바 드래그 이벤트
    const quickActionBar = document.getElementById('quickActionBar');
    const quickActionHandle = document.getElementById('quickActionHandle');
    
    if (quickActionBar && quickActionHandle) {
        let startY = 0;
        let currentY = 0;
        let isDragging = false;
        let startHeight = 0;
        
        const minHeight = 32; // 핸들만 보이는 최소 높이
        const maxHeight = 200; // 완전히 확장된 높이 (버튼 2개)
        
        // 터치 시작
        quickActionHandle.addEventListener('touchstart', (e) => {
            isDragging = true;
            startY = e.touches[0].clientY;
            startHeight = quickActionBar.offsetHeight;
            quickActionBar.style.transition = 'none';
        }, { passive: true });
        
        // 터치 이동
        quickActionHandle.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            
            currentY = e.touches[0].clientY;
            const deltaY = startY - currentY; // 위로 드래그하면 양수
            const newHeight = startHeight + deltaY;
            
            // 최소/최대 높이 제한
            const clampedHeight = Math.max(minHeight, Math.min(maxHeight, newHeight));
            
            quickActionBar.style.height = `${clampedHeight}px`;
        }, { passive: true });
        
        // 터치 종료
        const endDrag = () => {
            if (!isDragging) return;
            isDragging = false;
            
            const currentHeight = quickActionBar.offsetHeight;
            const threshold = (minHeight + maxHeight) / 2;
            
            // 인라인 스타일 제거하고 CSS transition으로 스냅
            quickActionBar.style.height = '';
            quickActionBar.style.transition = '';
            
            // 절반 이상 올렸으면 완전히 열기, 아니면 닫기
            if (currentHeight > threshold) {
                quickActionBar.classList.add('open');
            } else {
                quickActionBar.classList.remove('open');
            }
        };
        
        quickActionHandle.addEventListener('touchend', endDrag);
        quickActionHandle.addEventListener('touchcancel', endDrag);
        
        // 마우스 이벤트 (데스크톱 테스트용)
        quickActionHandle.addEventListener('mousedown', (e) => {
            isDragging = true;
            startY = e.clientY;
            startHeight = quickActionBar.offsetHeight;
            quickActionBar.style.transition = 'none';
            e.preventDefault();
        });
        
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            
            currentY = e.clientY;
            const deltaY = startY - currentY;
            const newHeight = startHeight + deltaY;
            
            const clampedHeight = Math.max(minHeight, Math.min(maxHeight, newHeight));
            
            quickActionBar.style.height = `${clampedHeight}px`;
        });
        
        document.addEventListener('mouseup', endDrag);
    }

    // 이미지 선택 모달 요소
    const imageSelectModal = document.getElementById('imageSelectModal');
    const cameraButton = document.getElementById('cameraButton');
    const albumButton = document.getElementById('albumButton');
    
    // 플러스 버튼 클릭 시 모달 표시
    imageUploadButton.addEventListener('click', () => {
        if (imageSelectModal) {
            imageSelectModal.style.display = 'flex';
        }
    });
    
    // 모달 배경 클릭 시 닫기
    if (imageSelectModal) {
    imageSelectModal.addEventListener('click', (e) => {
        if (e.target === imageSelectModal) {
            imageSelectModal.style.display = 'none';
        }
    });
    }
    
    // 카메라 버튼 (빈 버튼)
    if (cameraButton) {
        cameraButton.addEventListener('click', () => {
            // TODO: 카메라 기능 구현
            console.log('카메라 버튼 클릭');
            imageSelectModal.style.display = 'none';
        });
    }
    
    // 앨범 버튼 - 기존 이미지 업로드 기능 연결
    if (albumButton && imageSelectModal) {
        albumButton.addEventListener('click', () => {
            imageSelectModal.style.display = 'none';
            imageUploadInput.click();
        });
    }

    imageUploadInput.addEventListener('change', (event) => {
        const target = event.target;
        const file = target.files && target.files[0];
        if (file) {
            // 랜딩 페이지에서 이미지 선택 시 채팅 페이지로 전환
            const landingPage = document.getElementById('landingPage');
            const chatPage = document.getElementById('chatPage');
            if (landingPage && chatPage && landingPage.style.display !== 'none') {
                landingPage.style.display = 'none';
                chatPage.style.display = 'flex';
            }
            handleImageFile(file);
        }
        target.value = '';
    });
    
    userInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.keyCode === 13) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    console.log('이벤트 리스너 등록 완료');
    window.testStockParse = requestStockParse;
    
    // 모바일 키보드 대응
    let isKeyboardOpen = false;
    const chatContainer = document.querySelector('.chat-container');
    const originalHeight = window.innerHeight;

    window.addEventListener('resize', () => {
        const currentHeight = window.innerHeight;
        isKeyboardOpen = currentHeight < originalHeight * 0.75;
        
        if (isKeyboardOpen) {
            // 키보드가 열렸을 때 스크롤을 맨 아래로
            setTimeout(() => {
                if (chatMessages) {
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                }
            }, 100);
        }
    });

    // 입력창 포커스 시 키보드 대응
    userInput.addEventListener('focus', () => {
        setTimeout(() => {
            if (chatMessages) {
                chatMessages.scrollTop = chatMessages.scrollHeight;
            }
        }, 300);
    });

    // 터치 이벤트 최적화
    sendButton.addEventListener('touchstart', (e) => {
        e.preventDefault();
        sendButton.style.transform = 'scale(0.95)';
    }, { passive: false });

    sendButton.addEventListener('touchend', (e) => {
        e.preventDefault();
        sendButton.style.transform = 'scale(1)';
        sendMessage();
    }, { passive: false });
    
    // 홈화면 데이터 로드
    loadMarketIndices('kr');
    loadRankingStocks('popular');
    
    // 지수 탭 클릭 이벤트 (새로운 클래스명)
    const indexTabsMain = document.querySelectorAll('.index-tab-main');
    indexTabsMain.forEach(tab => {
        tab.addEventListener('click', () => {
            indexTabsMain.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const market = tab.dataset.market;
            loadMarketIndices(market);
        });
    });
    
    // 랭킹 탭 클릭 이벤트
    const rankingTabs = document.querySelectorAll('.ranking-tab');
    rankingTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            rankingTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const type = tab.dataset.type;
            loadRankingStocks(type);
        });
    });
    
    // 홈 버튼 클릭 이벤트
    if (homeButton) {
        homeButton.addEventListener('click', () => {
            if (landingPage && chatPage) {
                chatPage.style.display = 'none';
                landingPage.style.display = 'block';
                // 채팅 메시지 스크롤을 맨 위로
                if (chatMessages) {
                    chatMessages.scrollTop = 0;
                }
            }
        });
    }
});

// 지수 데이터 로드 함수
async function loadMarketIndices(market) {
    const container = document.getElementById('indexCardsContainer');
    if (!container) return;
    
    // 로딩 표시
    container.innerHTML = '<div style="padding: 20px; text-align: center; color: #666;">로딩 중...</div>';
    
    try {
        const response = await fetch(`${PYTHON_API_URL}/market-indices/${market}`);
        if (!response.ok) {
            throw new Error('지수 데이터를 가져올 수 없습니다.');
        }
        
        const data = await response.json();
        const indices = data.indices || [];
        
        if (indices.length === 0) {
            container.innerHTML = '<div style="padding: 20px; text-align: center; color: #666;">데이터가 없습니다.</div>';
            return;
        }
        
        // 카드 생성
        container.innerHTML = '';
        indices.forEach(index => {
            const card = createIndexCard(index);
            container.appendChild(card);
        });
    } catch (error) {
        console.error('지수 데이터 로드 오류:', error);
        container.innerHTML = '<div style="padding: 20px; text-align: center; color: #e74c3c;">데이터를 불러올 수 없습니다.</div>';
    }
}

// 지수 카드 생성 함수
function createIndexCard(index) {
    const card = document.createElement('div');
    card.className = 'index-card';
    
    const change = index.change || 0;
    const changePercent = index.changePercent || 0;
    const isPositive = change > 0;
    const isNegative = change < 0;
    const changeClass = isPositive ? 'positive' : (isNegative ? 'negative' : 'neutral');
    const changeSign = isPositive ? '+' : '';
    
    card.innerHTML = `
        <div class="index-card-name">${index.name}</div>
        <div class="index-card-value">${index.value.toLocaleString()}</div>
        <div class="index-card-change ${changeClass}">
            ${changeSign}${change.toFixed(2)}(${changeSign}${changePercent.toFixed(2)}%)
        </div>
    `;
    
    return card;
}

// 시가총액 상위 종목 로드 함수
async function loadTopStocksByMarketCap() {
    const container = document.getElementById('topStocksList');
    if (!container) return;
    
    // 로딩 표시
    container.innerHTML = '<div style="padding: 20px; text-align: center; color: #666;">로딩 중...</div>';
    
    try {
        const response = await fetch(`${PYTHON_API_URL}/top-stocks-by-market-cap`);
        if (!response.ok) {
            throw new Error('시가총액 상위 종목 데이터를 가져올 수 없습니다.');
        }
        
        const data = await response.json();
        const stocks = data.stocks || [];
        
        if (stocks.length === 0) {
            container.innerHTML = '<div style="padding: 20px; text-align: center; color: #666;">데이터가 없습니다.</div>';
            return;
        }
        
        // 종목 리스트 생성
        container.innerHTML = '';
        stocks.forEach(stock => {
            const item = createTopStockItem(stock);
            container.appendChild(item);
        });
    } catch (error) {
        console.error('시가총액 상위 종목 로드 오류:', error);
        container.innerHTML = '<div style="padding: 20px; text-align: center; color: #e74c3c;">데이터를 불러올 수 없습니다.</div>';
    }
}

// 시가총액 상위 종목 아이템 생성 함수
function createTopStockItem(stock) {
    const item = document.createElement('div');
    item.className = 'top-stock-item';
    
    const change = stock.change || 0;
    const changePercent = stock.changePercent || 0;
    const isPositive = change > 0;
    const isNegative = change < 0;
    const changeClass = isPositive ? 'positive' : (isNegative ? 'negative' : 'neutral');
    const changeSign = isPositive ? '+' : '';
    
    item.innerHTML = `
        <div class="top-stock-left">
            <div class="top-stock-name">${stock.name}</div>
            <div class="top-stock-market-cap">시가총액 ${stock.marketCap.toLocaleString()}억원</div>
        </div>
        <div class="top-stock-right">
            <div class="top-stock-price">${stock.price.toLocaleString()}원</div>
            <div class="top-stock-change ${changeClass}">
                ${changeSign}${change.toLocaleString()}(${changeSign}${changePercent.toFixed(2)}%)
            </div>
        </div>
    `;
    
    // 클릭 시 해당 종목 검색
    item.addEventListener('click', () => {
        const landingPage = document.getElementById('landingPage');
        const chatPage = document.getElementById('chatPage');
        if (landingPage && chatPage) {
            landingPage.style.display = 'none';
            chatPage.style.display = 'flex';
            // 종목명으로 검색
            setTimeout(() => {
                if (userInput) {
                    userInput.value = stock.name;
                    sendMessage();
                }
            }, 100);
        }
    });
    
    return item;
}

// 어닝콜 데이터 로드 함수
async function loadEarningsCall(symbol, container) {
    if (!container) return;
    
    container.innerHTML = '<div class="earnings-loading">로딩 중...</div>';
    
    try {
        const response = await fetch(`${PYTHON_API_URL}/stock/${symbol}/earnings-call`);
        if (!response.ok) {
            if (response.status === 404) {
                container.innerHTML = '<div class="earnings-empty">실적발표 요약 데이터가 없습니다.</div>';
            } else {
                throw new Error('어닝콜 데이터를 가져올 수 없습니다.');
            }
            return;
        }
        
        const earningsData = await response.json();
        renderEarningsCall(earningsData, container);
    } catch (error) {
        console.error('어닝콜 로드 오류:', error);
        container.innerHTML = '<div class="earnings-error">데이터를 불러올 수 없습니다.</div>';
    }
}

// 어닝콜 렌더링 함수
function renderEarningsCall(data, container) {
    if (!data || !container) return;
    
    const dateStr = data.date ? new Date(data.date).toLocaleDateString('ko-KR') : '';
    const period = data.year && data.quarter ? `${data.year} Q${data.quarter}` : '';
    
    let html = `
        <div class="earnings-call-content">
            ${dateStr || period ? `<div class="earnings-header-card">
                <div class="earnings-period">${period || dateStr}</div>
                ${dateStr && period ? `<div class="earnings-date">📅 ${dateStr}</div>` : ''}
            </div>` : ''}
    `;
    
    // 핵심 요약
    if (data.core_summary && data.core_summary.length > 0) {
        html += `
            <div class="earnings-section-card earnings-core">
                <div class="earnings-section-header">
                    <span class="earnings-icon">📊</span>
                <h6 class="earnings-section-title">핵심 요약</h6>
                </div>
                <ul class="earnings-list">
                    ${data.core_summary.map(item => `<li><span class="earnings-bullet">✓</span>${item}</li>`).join('')}
                </ul>
            </div>
        `;
    }
    
    // 투자하기 전에 알아두면 좋은 포인트
    if (data.investor_points && data.investor_points.length > 0) {
        html += `
            <div class="earnings-section-card earnings-investor">
                <div class="earnings-section-header">
                    <span class="earnings-icon">💡</span>
                    <h6 class="earnings-section-title">투자 포인트</h6>
                </div>
                <ul class="earnings-list">
                    ${data.investor_points.map(item => `<li><span class="earnings-bullet">•</span>${item}</li>`).join('')}
                </ul>
            </div>
        `;
    }
    
    // 세부 섹션 요약
    if (data.section_summary) {
        html += `
            <div class="earnings-section-card earnings-summary">
                <div class="earnings-section-header">
                    <span class="earnings-icon">📝</span>
                    <h6 class="earnings-section-title">상세 요약</h6>
                </div>
                <div class="earnings-summary-text">${data.section_summary}</div>
            </div>
        `;
    }
    
    // 가이던스
    if (data.guidance && data.guidance.length > 0) {
        html += `
            <div class="earnings-section-card earnings-guidance">
                <div class="earnings-section-header">
                    <span class="earnings-icon">🎯</span>
                <h6 class="earnings-section-title">가이던스</h6>
                </div>
                <ul class="earnings-list">
                    ${data.guidance.map(item => `<li><span class="earnings-bullet">→</span>${item}</li>`).join('')}
                </ul>
            </div>
        `;
    }
    
    // 실적발표
    if (data.release && data.release.length > 0) {
        html += `
            <div class="earnings-section-card earnings-release">
                <div class="earnings-section-header">
                    <span class="earnings-icon">📈</span>
                    <h6 class="earnings-section-title">실적 발표</h6>
                </div>
                <ul class="earnings-list">
                    ${data.release.map(item => `<li><span class="earnings-bullet">▸</span>${item}</li>`).join('')}
                </ul>
            </div>
        `;
    }
    
    // Q&A
    if (data.qa && data.qa.length > 0) {
        html += `
            <div class="earnings-section-card earnings-qa">
                <div class="earnings-section-header">
                    <span class="earnings-icon">💬</span>
                    <h6 class="earnings-section-title">Q&A 하이라이트</h6>
                </div>
                <ul class="earnings-list">
                    ${data.qa.map(item => `<li><span class="earnings-bullet">Q</span>${item}</li>`).join('')}
                </ul>
            </div>
        `;
    }
    
    html += '</div>';
    container.innerHTML = html;
}

// ============================================
// 랜딩 페이지 기능
// ============================================

// 주가 지수 데이터 로드 (국내/미국)
// 모크 데이터 생성
function getMockMarketIndices(market = 'kr') {
    if (market === 'kr') {
        return [
            { name: 'KOSPI', value: 2547.28, change: 15.42, changePercent: 0.61 },
            { name: 'KOSDAQ', value: 745.12, change: -3.87, changePercent: -0.52 },
            { name: 'KOSPI 200', value: 338.65, change: 2.18, changePercent: 0.65 }
        ];
    } else {
        return [
            { name: 'S&P 500', value: 5127.79, change: 28.47, changePercent: 0.56 },
            { name: 'NASDAQ', value: 16274.94, change: 115.23, changePercent: 0.71 },
            { name: 'DOW', value: 39043.32, change: -42.77, changePercent: -0.11 },
            { name: 'NIKKEI', value: 39189.33, change: 254.89, changePercent: 0.65 }
        ];
    }
}

function loadMarketIndices(market = 'kr') {
    const container = document.getElementById('indexCardsContainer');
    if (!container) return;
    
    const indices = getMockMarketIndices(market);
    
    // 지수 카드 생성
    container.innerHTML = '';
    indices.forEach(index => {
        const card = createIndexCard(index);
        container.appendChild(card);
    });
    
    // Lucide 아이콘 초기화
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

// 지수 카드 생성 함수
function createIndexCard(index) {
    const card = document.createElement('div');
    card.className = 'index-card';
    
    const change = index.change || 0;
    const changePercent = index.changePercent || 0;
    const isPositive = change > 0;
    const isNegative = change < 0;
    const changeClass = isPositive ? 'positive' : (isNegative ? 'negative' : 'neutral');
    const changeSign = isPositive ? '+' : '';
    
    card.innerHTML = `
        <div class="index-card-name">${index.name}</div>
        <div class="index-card-value">${index.value.toLocaleString()}</div>
        <div class="index-card-change ${changeClass}">
            ${changeSign}${change.toLocaleString()}(${changeSign}${changePercent.toFixed(2)}%)
            </div>
        `;
    
    return card;
}

// 랭킹 종목 모크 데이터
function getMockRankingStocks(type = 'popular') {
    const stocks = {
        popular: [
            { name: '삼성전자', code: '005930', price: 71800, change: 1200, changePercent: 1.70, logo: '🔷' },
            { name: 'SK하이닉스', code: '000660', price: 168500, change: -2500, changePercent: -1.46, logo: '🔶' },
            { name: 'LG에너지솔루션', code: '373220', price: 435000, change: 8000, changePercent: 1.87, logo: '⚡' },
            { name: '카카오', code: '035720', price: 52400, change: 3200, changePercent: 6.50, logo: '💬' },
            { name: 'POSCO홀딩스', code: '005490', price: 387000, change: -5000, changePercent: -1.28, logo: '🏭' }
        ],
        volume: [
            { name: '엔비디아', code: 'NVDA', price: 190.17, change: 3.31, changePercent: 1.77, logo: '💚', isUs: true },
            { name: '테슬라', code: 'TSLA', price: 404.35, change: 2.37, changePercent: 0.59, logo: '🚗', isUs: true },
            { name: '애플', code: 'AAPL', price: 272.41, change: -0.54, changePercent: -0.20, logo: '🍎', isUs: true },
            { name: '알파벳 A', code: 'GOOGL', price: 276.41, change: -2.17, changePercent: -0.78, logo: '🔍', isUs: true },
            { name: '아이오쿠', code: 'ROKU', price: 47.18, change: -1.23, changePercent: -2.54, logo: '📺', isUs: true }
        ],
        gainers: [
            { name: '에코프로', code: '086520', price: 856000, change: 198000, changePercent: 30.00, logo: '🔋', limit: true },
            { name: '에코프로비엠', code: '247540', price: 345000, change: 77500, changePercent: 28.97, logo: '⚡' },
            { name: 'HLB', code: '028300', price: 67800, change: 15600, changePercent: 29.89, logo: '💊' },
            { name: '알테오젠', code: '196170', price: 178500, change: 41000, changePercent: 29.82, logo: '🧬' },
            { name: 'HD현대일렉트릭', code: '267260', price: 245000, change: 54000, changePercent: 28.27, logo: '⚡' }
        ],
        new: [
            { name: 'LG전자', code: '066570', price: 98500, change: 1500, changePercent: 1.55, logo: '📱' },
            { name: '현대차', code: '005380', price: 245000, change: -3000, changePercent: -1.21, logo: '🚙' },
            { name: '삼성바이오로직스', code: '207940', price: 856000, change: 12000, changePercent: 1.42, logo: '🧪' },
            { name: 'KB금융', code: '105560', price: 67800, change: 800, changePercent: 1.19, logo: '🏦' },
            { name: '네이버', code: '035420', price: 178500, change: -2500, changePercent: -1.38, logo: '🟢' }
        ]
    };
    
    return stocks[type] || stocks.popular;
}

// 급등주 모크 데이터
function getMockGainersStocks() {
    return [
        { name: '에코프로', code: '086520', price: 856000, change: 198000, changePercent: 30.00, limit: true },
        { name: '에코프로비엠', code: '247540', price: 345000, change: 77500, changePercent: 28.97, limit: false },
        { name: 'HLB', code: '028300', price: 67800, change: 15600, changePercent: 29.89, limit: false },
        { name: '알테오젠', code: '196170', price: 178500, change: 41000, changePercent: 29.82, limit: false },
        { name: 'HD현대일렉트릭', code: '267260', price: 245000, change: 54000, changePercent: 28.27, limit: false }
    ];
}

// 테마 모크 데이터
function getMockThemes() {
    return [
        { name: '2차전지', changePercent: 5.24, color: '#ef4444' },
        { name: 'AI·반도체', changePercent: 3.78, color: '#8b5cf6' },
        { name: '바이오', changePercent: 2.45, color: '#10b981' },
        { name: '방산', changePercent: 4.12, color: '#f59e0b' },
        { name: '게임', changePercent: -1.23, color: '#6366f1' },
        { name: '엔터테인먼트', changePercent: 1.89, color: '#ec4899' }
    ];
}

// 시장 뉴스 모크 데이터
function getMockMarketNews() {
    return [
        { 
            title: '코스피, 외국인 순매수에 2550선 회복...IT株 강세', 
            source: '한국경제', 
            time: '15분 전',
            category: '증시'
        },
        { 
            title: '삼성전자, AI칩 신제품 공개...주가 급등', 
            source: '매일경제', 
            time: '1시간 전',
            category: '종목'
        },
        { 
            title: '2차전지 업계, 북미 수주 확대 기대감 확산', 
            source: '서울경제', 
            time: '2시간 전',
            category: '산업'
        },
        { 
            title: '연준 금리 동결 전망...증시 훈풍 예고', 
            source: '이데일리', 
            time: '3시간 전',
            category: '국제'
        }
    ];
}

// 랭킹 종목 로드
function loadRankingStocks(type = 'popular') {
    const container = document.getElementById('rankingList');
    if (!container) return;
    
    const stocks = getMockRankingStocks(type);
    
    container.innerHTML = '';
    stocks.forEach((stock, index) => {
        const item = createRankingStockItem(stock, index + 1);
        container.appendChild(item);
    });
}

// 테마 로드
function loadThemes() {
    const container = document.getElementById('themesGrid');
    if (!container) return;
    
    const themes = getMockThemes();
    
    container.innerHTML = '';
    themes.forEach(theme => {
        const item = createThemeCard(theme);
        container.appendChild(item);
    });
}

// 시장 뉴스 로드
function loadMarketNews() {
    const container = document.getElementById('marketNewsList');
    if (!container) return;
    
    const news = getMockMarketNews();
    
    container.innerHTML = '';
    news.forEach(newsItem => {
        const item = createNewsListItem(newsItem);
        container.appendChild(item);
    });
}

// 랭킹 종목 아이템 생성 함수
function createRankingStockItem(stock, rank) {
    const item = document.createElement('div');
    item.className = 'ranking-stock-item';
    
    const change = stock.change || 0;
    const changePercent = stock.changePercent || 0;
    const isPositive = change > 0;
    const isNegative = change < 0;
    const changeClass = isPositive ? 'positive' : (isNegative ? 'negative' : 'neutral');
    const changeSign = isPositive ? '+' : '';
    
    // 미국 주식과 한국 주식의 가격 표시 형식 다르게
    const priceDisplay = stock.isUs 
        ? `$${stock.price.toFixed(2)}` 
        : `${stock.price.toLocaleString()}원`;
    
    item.innerHTML = `
        <div class="ranking-number">${rank}</div>
        <div class="ranking-logo">${stock.logo}</div>
        <div class="ranking-stock-info">
            <div class="ranking-stock-name">${stock.name}</div>
            <div class="ranking-stock-code">${stock.code}</div>
        </div>
        <div class="ranking-price-info">
            <div class="ranking-price">${priceDisplay}</div>
            <div class="ranking-change ${changeClass}">
                ${changeSign}${changePercent.toFixed(2)}%
            </div>
        </div>
    `;
    
    // 클릭 시 해당 종목 검색
    item.addEventListener('click', () => {
        const landingPage = document.getElementById('landingPage');
        const chatPage = document.getElementById('chatPage');
        if (landingPage && chatPage) {
            landingPage.style.display = 'none';
            chatPage.style.display = 'flex';
            setTimeout(() => {
                if (userInput) {
                    userInput.value = stock.name;
                    sendMessage();
                }
            }, 100);
        }
    });
    
    return item;
}

// 테마 카드 생성 함수
function createThemeCard(theme) {
    const card = document.createElement('div');
    card.className = 'theme-card';
    card.style.borderLeftColor = theme.color;
    
    const isPositive = theme.changePercent > 0;
    const changeClass = isPositive ? 'positive' : 'negative';
    const changeSign = isPositive ? '+' : '';
    
    card.innerHTML = `
        <div class="theme-name">${theme.name}</div>
        <div class="theme-change ${changeClass}">
            ${changeSign}${theme.changePercent.toFixed(2)}%
        </div>
    `;
    
    return card;
}

// 뉴스 리스트 아이템 생성 함수
function createNewsListItem(newsItem) {
    const item = document.createElement('div');
    item.className = 'news-list-item';
    
    item.innerHTML = `
        <div class="news-category-badge">${newsItem.category}</div>
        <div class="news-title">${newsItem.title}</div>
        <div class="news-meta">
            <span class="news-source">${newsItem.source}</span>
            <span class="news-time">${newsItem.time}</span>
        </div>
    `;
    
    return item;
}

// 시가총액 상위 종목 아이템 생성 함수
function createTopStockItem(stock) {
    const item = document.createElement('div');
    item.className = 'top-stock-item';
    
    const change = stock.change || 0;
    const changePercent = stock.changePercent || 0;
    const isPositive = change > 0;
    const isNegative = change < 0;
    const changeClass = isPositive ? 'positive' : (isNegative ? 'negative' : 'neutral');
    const changeSign = isPositive ? '+' : '';
    
    item.innerHTML = `
        <div class="top-stock-left">
            <div class="top-stock-name">${stock.name}</div>
            <div class="top-stock-market-cap">시가총액 ${stock.marketCap.toLocaleString()}억원</div>
        </div>
        <div class="top-stock-right">
            <div class="top-stock-price">${stock.price.toLocaleString()}원</div>
            <div class="top-stock-change ${changeClass}">
                ${changeSign}${change.toLocaleString()}(${changeSign}${changePercent.toFixed(2)}%)
            </div>
        </div>
    `;
    
    // 클릭 시 해당 종목 검색
    item.addEventListener('click', () => {
        const landingPage = document.getElementById('landingPage');
        const chatPage = document.getElementById('chatPage');
        if (landingPage && chatPage) {
            landingPage.style.display = 'none';
            chatPage.style.display = 'flex';
            // 종목명으로 검색
            setTimeout(() => {
                if (userInput) {
                    userInput.value = stock.name;
                    sendMessage();
                }
            }, 100);
        }
    });
    
    return item;
}

// ============================================
// 이벤트 리스너 초기화
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM 로드 완료');
    
    // Lucide 아이콘 초기화
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
    
    // 이미지 업로드 input
    imageUploadInput = document.getElementById('imageUploadInput');
    
    // 랜딩 페이지 UI 요소
    const landingSearchBar = document.getElementById('landingSearchBar');
    const homeButton = document.getElementById('homeButton');
    const landingCameraFloatingButton = document.getElementById('landingCameraFloatingButton');
    
    // 검색바 클릭 시 채팅 페이지로 이동
    if (landingSearchBar) {
        landingSearchBar.addEventListener('click', () => {
            const landingPage = document.getElementById('landingPage');
            const chatPage = document.getElementById('chatPage');
            if (landingPage && chatPage) {
                landingPage.style.display = 'none';
                chatPage.style.display = 'flex';
                setTimeout(() => {
                    if (userInput) {
                        userInput.focus();
                    }
                }, 100);
            }
        });
    }
    
    // 홈 버튼 클릭 시 랜딩 페이지로 이동
    if (homeButton) {
        homeButton.addEventListener('click', () => {
            const landingPage = document.getElementById('landingPage');
            const chatPage = document.getElementById('chatPage');
            if (landingPage && chatPage) {
                chatPage.style.display = 'none';
                landingPage.style.display = 'block';
            }
        });
    }
    
    // 랜딩 페이지 카메라 플로팅 버튼 클릭 시
    if (landingCameraFloatingButton) {
        landingCameraFloatingButton.addEventListener('click', () => {
            if (imageUploadInput) {
                imageUploadInput.click();
            }
        });
    }
    
    // DOM 요소 선택 (채팅 페이지)
    chatMessages = document.getElementById('chatMessages');
    userInput = document.getElementById('userInput');
    sendButton = document.getElementById('sendButton');
    imageUploadButton = document.getElementById('imageUploadButton');
    
    // 요소가 존재하는지 확인
    if (!chatMessages || !userInput || !sendButton || !imageUploadInput || !imageUploadButton) {
        console.error('필수 DOM 요소를 찾을 수 없습니다.');
        return;
    }
    
    // 이벤트 리스너 등록
    sendButton.addEventListener('click', sendMessage);

    // 이미지 토글 메뉴
    const imageToggleMenu = document.getElementById('imageToggleMenu');
    const cameraButton = document.getElementById('cameraButton');
    const albumButton = document.getElementById('albumButton');
    
    // 검색 토글 메뉴
    const searchToggleButton = document.getElementById('searchToggleButton');
    const searchToggleMenu = document.getElementById('searchToggleMenu');
    const searchStockButton = document.getElementById('searchStockButton');
    const searchNewsButton = document.getElementById('searchNewsButton');
    
    // 이미지 업로드 버튼 클릭 시 토글 메뉴 표시/숨김
    if (imageUploadButton && imageToggleMenu) {
        imageUploadButton.addEventListener('click', (e) => {
            e.stopPropagation();
            const isVisible = imageToggleMenu.style.display === 'flex';
            imageToggleMenu.style.display = isVisible ? 'none' : 'flex';
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        });
    }
    
    // 검색 토글 버튼 클릭 시 토글 메뉴 표시/숨김
    if (searchToggleButton && searchToggleMenu) {
        searchToggleButton.addEventListener('click', (e) => {
            e.stopPropagation();
            const isVisible = searchToggleMenu.style.display === 'flex';
            searchToggleMenu.style.display = isVisible ? 'none' : 'flex';
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        });
    }
    
    // 외부 클릭 시 토글 메뉴 닫기
    document.addEventListener('click', (e) => {
        if (imageToggleMenu && !imageToggleMenu.contains(e.target) && e.target !== imageUploadButton) {
            imageToggleMenu.style.display = 'none';
        }
        if (searchToggleMenu && !searchToggleMenu.contains(e.target) && e.target !== searchToggleButton) {
            searchToggleMenu.style.display = 'none';
        }
    });
    
    // 카메라 버튼 - 카메라 모달 열기
    if (cameraButton) {
        cameraButton.addEventListener('click', () => {
            if (imageToggleMenu) {
                imageToggleMenu.style.display = 'none';
            }
            openCameraModal();
        });
    }
    
    // 앨범 버튼 - 기존 이미지 업로드 기능 연결
    if (albumButton) {
        albumButton.addEventListener('click', () => {
            if (imageToggleMenu) {
                imageToggleMenu.style.display = 'none';
            }
            if (imageUploadInput) {
                imageUploadInput.click();
            }
        });
    }
    
    // 주식 검색 버튼
    if (searchStockButton) {
        searchStockButton.addEventListener('click', () => {
            if (searchToggleMenu) {
                searchToggleMenu.style.display = 'none';
            }
            // 채팅 페이지로 전환하고 입력창에 포커스
            const landingPage = document.getElementById('landingPage');
            const chatPage = document.getElementById('chatPage');
            if (landingPage && chatPage) {
                landingPage.style.display = 'none';
                chatPage.style.display = 'flex';
                setTimeout(() => {
                    if (userInput) {
                        userInput.focus();
                    }
                }, 100);
            }
        });
    }
    
    // 뉴스 검색 버튼
    if (searchNewsButton) {
        searchNewsButton.addEventListener('click', () => {
            if (searchToggleMenu) {
                searchToggleMenu.style.display = 'none';
            }
            // 채팅 페이지로 전환하고 뉴스 검색 안내
            const landingPage = document.getElementById('landingPage');
            const chatPage = document.getElementById('chatPage');
            if (landingPage && chatPage) {
                landingPage.style.display = 'none';
                chatPage.style.display = 'flex';
                setTimeout(() => {
                    if (userInput) {
                        userInput.value = '뉴스';
                        userInput.focus();
                    }
                }, 100);
            }
        });
    }

    imageUploadInput.addEventListener('change', (event) => {
        const target = event.target;
        const file = target.files && target.files[0];
        if (file) {
            // 랜딩 페이지에서 이미지 선택 시 채팅 페이지로 전환
            const landingPage = document.getElementById('landingPage');
            const chatPage = document.getElementById('chatPage');
            if (landingPage && chatPage && landingPage.style.display !== 'none') {
                landingPage.style.display = 'none';
                chatPage.style.display = 'flex';
            }
            handleImageFile(file);
        }
        target.value = '';
    });
    
    userInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.keyCode === 13) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    console.log('이벤트 리스너 등록 완료');
    window.testStockParse = requestStockParse;
    
    // 모바일 키보드 대응
    let isKeyboardOpen = false;
    const chatContainer = document.querySelector('.chat-container');
    const originalHeight = window.innerHeight;

    window.addEventListener('resize', () => {
        const currentHeight = window.innerHeight;
        isKeyboardOpen = currentHeight < originalHeight * 0.75;
        
        if (isKeyboardOpen) {
            // 키보드가 열렸을 때 스크롤을 맨 아래로
            setTimeout(() => {
                if (chatMessages) {
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                }
            }, 100);
        }
    });

    // 입력창 포커스 시 키보드 대응
    userInput.addEventListener('focus', () => {
        setTimeout(() => {
            if (chatMessages) {
                chatMessages.scrollTop = chatMessages.scrollHeight;
            }
        }, 300);
    });

    // 터치 이벤트 최적화
    sendButton.addEventListener('touchstart', (e) => {
        e.preventDefault();
        sendButton.style.transform = 'scale(0.95)';
    }, { passive: false });

    sendButton.addEventListener('touchend', (e) => {
        e.preventDefault();
        sendButton.style.transform = 'scale(1)';
        sendMessage();
    }, { passive: false });
    
    // 홈화면 데이터 로드
    loadMarketIndices('kr');
    loadRankingStocks('popular');
    
    // 지수 탭 클릭 이벤트 (새로운 클래스명)
    const indexTabsMain2 = document.querySelectorAll('.index-tab-main');
    indexTabsMain2.forEach(tab => {
        tab.addEventListener('click', () => {
            indexTabsMain2.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const market = tab.dataset.market;
            loadMarketIndices(market);
        });
    });
    
    // 랭킹 탭 클릭 이벤트
    const rankingTabs2 = document.querySelectorAll('.ranking-tab');
    rankingTabs2.forEach(tab => {
        tab.addEventListener('click', () => {
            rankingTabs2.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const type = tab.dataset.type;
            loadRankingStocks(type);
        });
    });
    
    // 카메라 모달 이벤트 리스너
    const cameraCloseBtn = document.getElementById('cameraCloseBtn');
    const cameraCaptureBtn = document.getElementById('cameraCaptureBtn');
    
    if (cameraCloseBtn) {
        cameraCloseBtn.addEventListener('click', closeCameraModal);
    }
    
    if (cameraCaptureBtn) {
        cameraCaptureBtn.addEventListener('click', capturePhoto);
    }
});

// 카메라 관련 변수
let cameraStream = null;
const cameraModal = document.getElementById('cameraModal');
const cameraVideo = document.getElementById('cameraVideo');
const cameraCanvas = document.getElementById('cameraCanvas');

// 카메라 모달 열기
async function openCameraModal() {
    try {
        // 카메라 권한 요청 및 스트림 가져오기
        cameraStream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: 'environment', // 후면 카메라 우선 (모바일)
                width: { ideal: 1920 },
                height: { ideal: 1080 }
            }
        });
        
        // 비디오 요소에 스트림 연결
        if (cameraVideo) {
            cameraVideo.srcObject = cameraStream;
        }
        
        // 모달 표시
        if (cameraModal) {
            cameraModal.style.display = 'flex';
            // Lucide 아이콘 다시 초기화
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        }
        
        // 랜딩 페이지에서 카메라 열면 채팅 페이지로 전환
        const landingPage = document.getElementById('landingPage');
        const chatPage = document.getElementById('chatPage');
        if (landingPage && chatPage && landingPage.style.display !== 'none') {
            landingPage.style.display = 'none';
            chatPage.style.display = 'flex';
        }
    } catch (error) {
        console.error('카메라 접근 오류:', error);
        alert('카메라에 접근할 수 없습니다. 카메라 권한을 확인해주세요.');
    }
}

// 카메라 모달 닫기
function closeCameraModal() {
    // 카메라 스트림 종료
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }
    
    // 비디오 소스 초기화
    if (cameraVideo) {
        cameraVideo.srcObject = null;
    }
    
    // 모달 숨기기
    if (cameraModal) {
        cameraModal.style.display = 'none';
    }
}

// 사진 촬영
function capturePhoto() {
    if (!cameraVideo || !cameraCanvas) {
        console.error('카메라 요소를 찾을 수 없습니다.');
        return;
    }
    
    const context = cameraCanvas.getContext('2d');
    
    // 실제 비디오 크기
    const videoWidth = cameraVideo.videoWidth;
    const videoHeight = cameraVideo.videoHeight;
    
    // 화면에 표시되는 비디오 요소의 크기
    const displayWidth = cameraVideo.clientWidth;
    const displayHeight = cameraVideo.clientHeight;
    
    // 비디오와 디스플레이의 종횡비
    const videoAspect = videoWidth / videoHeight;
    const displayAspect = displayWidth / displayHeight;
    
    let sourceX = 0;
    let sourceY = 0;
    let sourceWidth = videoWidth;
    let sourceHeight = videoHeight;
    
    // object-fit: cover 로직 - 화면에 보이는 영역만 계산
    if (videoAspect > displayAspect) {
        // 비디오가 더 넓음 - 좌우가 잘림
        sourceWidth = videoHeight * displayAspect;
        sourceX = (videoWidth - sourceWidth) / 2;
    } else {
        // 비디오가 더 높음 - 상하가 잘림
        sourceHeight = videoWidth / displayAspect;
        sourceY = (videoHeight - sourceHeight) / 2;
    }
    
    // 캔버스 크기를 디스플레이 비율로 설정 (고해상도 유지)
    const outputWidth = 1920;
    const outputHeight = Math.round(outputWidth / displayAspect);
    
    cameraCanvas.width = outputWidth;
    cameraCanvas.height = outputHeight;
    
    // 화면에 보이는 영역만 캔버스에 그리기
    context.drawImage(
        cameraVideo,
        sourceX, sourceY, sourceWidth, sourceHeight,  // 소스 영역 (비디오에서 크롭)
        0, 0, outputWidth, outputHeight                // 대상 영역 (캔버스 전체)
    );
    
    // 캔버스를 Blob으로 변환
    cameraCanvas.toBlob(async (blob) => {
        if (blob) {
            // Blob을 File 객체로 변환
            const file = new File([blob], 'camera-photo.jpg', { type: 'image/jpeg' });
            
            // 카메라 모달 닫기
            closeCameraModal();
            
            // 이미지 파일 처리
            await handleImageFile(file);
        } else {
            console.error('사진 캡처 실패');
            alert('사진을 촬영할 수 없습니다. 다시 시도해주세요.');
        }
    }, 'image/jpeg', 0.95); // 95% 품질로 JPEG 저장
}

