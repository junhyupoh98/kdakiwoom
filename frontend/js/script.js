// 전역 변수
const API_BASE_URL = 'http://localhost:3000/api';
const PYTHON_API_URL = 'http://localhost:5000/api';

// 차트 인스턴스 보관
const chartInstances = {};

// DOM 요소 변수
let chatMessages, userInput, sendButton, imageUploadInput, imageUploadButton;

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
    '코스닥': 'KRX'
};

const SUPPORTED_MARKETS = new Set(['NASDAQ', 'NYSE', 'KRX']);

// 이미지 업로드 처리
async function handleImageFile(file) {
    if (!file) {
        return;
    }

    displayImagePreviewMessage(file);

    const loadingId = addLoadingMessage('이미지 분석 중...');

    try {
        const analysisResult = await requestVisionAnalysis(file);

        removeMessage(loadingId);

        if (analysisResult) {
            addVisionResultMessage(analysisResult);
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

async function requestVisionAnalysis(file) {
    const formData = new FormData();
    formData.append('file', file, file.name || 'image.jpg');

    const response = await fetch(`${PYTHON_API_URL}/vision/analyze-image`, {
        method: 'POST',
        body: formData
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`이미지 분석 API 오류 (${response.status}): ${errorText}`);
    }

    return response.json();
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
    if (result?.primary) {
        sections.push({ ...result.primary, source: 'primary' });
    }
    if (result?.fallback) {
        sections.push({ ...result.fallback, source: 'fallback' });
    }

    for (const section of sections) {
        const ticker = sanitizeTicker(section.company_ticker);
        const market = normalizeMarketName(section.company_market);
        if (!ticker || !market || !SUPPORTED_MARKETS.has(market)) {
            continue;
        }

        const searchTicker = (() => {
            if (market === 'KRX' && /^\d{6}$/.test(ticker)) {
                return ticker;
            }
            return ticker;
        })();

        return {
            market,
            ticker,
            searchTicker,
            source: section.source,
            company: section.company || '',
            brand: section.brand || ''
        };
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
    
    // AI 파서 결과 적용 (쉼표로 구분된 다중 입력이 아닐 때만)
    let searchInput = message;
    let aiTicker = null;
    if (!message.includes(',')) {
        const aiParseResult = await requestStockParse(message);
        if (aiParseResult?.is_stock_query && aiParseResult.stock_name) {
            if (aiParseResult.ticker) {
                aiTicker = aiParseResult.ticker.trim();
            }
            searchInput = (aiTicker || aiParseResult.stock_name).trim();
            console.log('[AI 파서 적용]', aiParseResult);
        }
    }
    
    // 사용자 메시지 표시
    addMessage(message, 'user');
    userInput.value = '';
    
    // 여러 종목 입력 확인 (쉼표로 구분)
    const stocks = parseMultipleStocks(searchInput);
    
    if (stocks.length > 1) {
        // 여러 종목인 경우 버튼 목록 표시
        addStockSelectionButtons(stocks);
    } else {
        // 단일 종목 검색
        const loadingId = addLoadingMessage();
        
        try {
            // 주가 정보 검색
            const stockData = await fetchStockData(aiTicker || stocks[0] || searchInput);
            
            // 로딩 메시지 제거
            removeMessage(loadingId);
            
            if (stockData) {
                // 주가 정보 표시
                addStockMessage(stockData);
            } else {
                const botResponse = getBotResponse(message);
                addMessage(botResponse, 'bot');
            }
        } catch (error) {
            removeMessage(loadingId);
            addMessage('주가 정보를 가져오는 중 오류가 발생했습니다.', 'bot');
            console.error('오류:', error);
        }
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
    
    // 최신 데이터 가져오기
    const latest = financialData.latest || {};
    const latestYear = latest.year || '';
    const hasSegments = financialData.segments && financialData.segments.length > 0;
    
    const chartData = financialData.chartData || [];
    const quarterData = chartData.filter(item => typeof item.year === 'string' && item.year.includes('Q'));
    const annualData = chartData.filter(item => typeof item.year === 'string' && !item.year.includes('Q'));
    const hasQuarterData = quarterData.length > 0;
    const hasAnnualData = annualData.length > 0;

    const defaultData = hasQuarterData ? quarterData : annualData;

    financialSection.innerHTML = `
        <h4 class="financial-title">📊 ${companyName} 재무제표</h4>
        ${(hasQuarterData || hasAnnualData) ? `
        <div class="financial-toggle">
            ${hasQuarterData ? `<button class="toggle-btn ${hasQuarterData ? 'active' : ''}" data-type="quarter">최근 분기</button>` : ''}
            ${hasAnnualData ? `<button class="toggle-btn ${hasQuarterData ? '' : 'active'}" data-type="annual">연간</button>` : ''}
        </div>
        ` : ''}
        <div class="financial-chart-container">
            <canvas id="${chartId}"></canvas>
        </div>
        ${hasSegments ? `
        <div class="segment-section">
            <h5 class="segment-title">사업 부문별 매출</h5>
            <div class="segment-chart-container">
                <canvas id="${segmentChartId}"></canvas>
            </div>
            ${financialData.segmentDate ? `<div class="segment-date">기준일: ${financialData.segmentDate}</div>` : ''}
        </div>
        ` : ''}
        <div class="financial-summary">
            <div class="financial-item">
                <span class="financial-label">매출액</span>
                <span class="financial-value">${latestYear ? formatNumberInHundredMillion(latest.revenue) : '-'}</span>
            </div>
            <div class="financial-item">
                <span class="financial-label">영업이익</span>
                <span class="financial-value">${latestYear ? formatNumberInHundredMillion(latest.operatingIncome) : '-'}</span>
            </div>
            <div class="financial-item">
                <span class="financial-label">당기순이익</span>
                <span class="financial-value">${latestYear ? formatNumberInHundredMillion(latest.netIncome) : '-'}</span>
            </div>
            ${latestYear ? `<div class="financial-year">기준연도: ${latestYear}</div>` : ''}
        </div>
    `;
    
    contentDiv.appendChild(financialSection);
    messageDiv.appendChild(contentDiv);
    chatMessages.appendChild(messageDiv);
    
    // 차트 렌더링
    setTimeout(() => {
        renderFinancialChart(chartId, defaultData);

        const toggleButtons = financialSection.querySelectorAll('.financial-toggle .toggle-btn');
        toggleButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const type = btn.dataset.type;
                toggleButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const selectedData = type === 'annual' ? annualData : quarterData;
                renderFinancialChart(chartId, selectedData);
            });
        });

        if (hasSegments) {
            console.log('세그먼트 데이터:', financialData.segments);
            renderSegmentChart(segmentChartId, financialData.segments, financialData.segmentCurrency || 'USD');
        } else {
            console.log('세그먼트 데이터 없음');
        }
    }, 100);
    
    // 스크롤을 맨 아래로
    chatMessages.scrollTop = chatMessages.scrollHeight;
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
    
    const labels = chartSegments.map(s => `${s.segment} (${s.percentage.toFixed(1)}%)`);
    const data = chartSegments.map(s => s.revenue);
    const colors = [
        '#667eea', '#48bb78', '#ed8936', '#f56565', '#9f7aea',
        '#38b2ac', '#f6ad55', '#fc8181', '#68d391', '#63b3ed'
    ];
    
    const ctx = canvas.getContext('2d');
    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors.slice(0, chartSegments.length),
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'right',
                    labels: {
                        usePointStyle: true,
                        pointStyle: 'circle',
                        padding: 12,
                        font: {
                            size: 12,
                            weight: '500'
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const segment = chartSegments[context.dataIndex];
                            const currencySymbol = currency === 'KRW' ? '₩' : (currency === 'USD' ? '$' : currency);
                            const revenue = segment.revenue.toLocaleString();
                            return `${segment.segment}: ${currencySymbol}${revenue} (${segment.percentage.toFixed(1)}%)`;
                        }
                    }
                }
            }
        }
    });
}

// 재무제표 차트 렌더링
function renderFinancialChart(canvasId, chartData) {
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
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: '매출액',
                    data: revenueData,
                    borderColor: '#667eea',
                    backgroundColor: 'rgba(102, 126, 234, 0.1)',
                    tension: 0.4,
                    fill: false,
                    yAxisID: 'y'
                },
                {
                    label: '영업이익',
                    data: operatingIncomeData,
                    borderColor: '#48bb78',
                    backgroundColor: 'rgba(72, 187, 120, 0.1)',
                    tension: 0.4,
                    fill: false,
                    yAxisID: 'y'
                },
                {
                    label: '당기순이익',
                    data: netIncomeData,
                    borderColor: '#ed8936',
                    backgroundColor: 'rgba(237, 137, 54, 0.1)',
                    tension: 0.4,
                    fill: false,
                    yAxisID: 'y'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom',
                    align: 'center',
                    labels: {
                        usePointStyle: true,
                        pointStyle: 'circle',
                        padding: 15,
                        font: {
                            size: 13,
                            weight: '500',
                            family: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Noto Sans KR", sans-serif'
                        },
                        color: '#333',
                        boxWidth: 12,
                        boxHeight: 12
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    padding: 12,
                    titleFont: {
                        size: 13,
                        weight: '600'
                    },
                    bodyFont: {
                        size: 12
                    },
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                    borderWidth: 1,
                    cornerRadius: 8,
                    displayColors: true,
                    callbacks: {
                        label: function(context) {
                            return context.dataset.label + ': ' + formatNumberInHundredMillion(context.parsed.y);
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: false,
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)',
                        drawBorder: false
                    },
                    ticks: {
                        callback: function(value) {
                            return formatNumberInHundredMillion(value);
                        },
                        font: {
                            size: 11
                        },
                        color: '#666',
                        padding: 8
                    }
                },
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        font: {
                            size: 11
                        },
                        color: '#666',
                        padding: 8
                    }
                }
            },
            layout: {
                padding: {
                    bottom: 10
                }
            }
        }
    });
}

// 뉴스 메시지 추가
function addNewsMessage(companyName, symbol, newsList) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message bot-message';
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content stock-content';
    
    const newsSection = document.createElement('div');
    newsSection.className = 'news-section';
    newsSection.innerHTML = `
        <h4 class="news-title">📰 ${companyName} 최신 뉴스</h4>
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
    `;
    
    contentDiv.appendChild(newsSection);
    messageDiv.appendChild(contentDiv);
    chatMessages.appendChild(messageDiv);
    
    // 스크롤을 맨 아래로
    chatMessages.scrollTop = chatMessages.scrollHeight;
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
function addLoadingMessage(text = '검색 중...') {
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
            <h3>${stockData.name}</h3>
            <span class="stock-symbol">${stockData.symbol}</span>
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
                📊 재무제표
            </button>
            <button class="action-btn news-btn" data-symbol="${stockData.symbol}">
                📰 뉴스
            </button>
        </div>
    `;
    
    contentDiv.appendChild(stockInfo);
    messageDiv.appendChild(contentDiv);
    chatMessages.appendChild(messageDiv);
    
    // 버튼 이벤트 리스너 추가
    const financialBtn = stockInfo.querySelector('.financial-btn');
    const newsBtn = stockInfo.querySelector('.news-btn');
    
    if (financialBtn) {
        financialBtn.addEventListener('click', async () => {
            // 버튼 비활성화
            financialBtn.disabled = true;
            financialBtn.style.opacity = '0.6';
            financialBtn.textContent = '📊 재무제표 로딩 중...';
            
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
                financialBtn.textContent = '📊 재무제표';
            }
        });
    }
    
    if (newsBtn) {
        newsBtn.addEventListener('click', async () => {
            // 버튼 비활성화
            newsBtn.disabled = true;
            newsBtn.style.opacity = '0.6';
            newsBtn.textContent = '📰 뉴스 로딩 중...';
            
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
                newsBtn.textContent = '📰 뉴스';
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
                borderColor: '#667eea',
                backgroundColor: 'rgba(102, 126, 234, 0.1)',
                tension: 0.4,
                fill: true,
                pointRadius: 0,
                pointHoverRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: false,
                    ticks: {
                        callback: function(value) {
                            return formatNumber(value);
                        }
                    }
                },
                x: {
                    ticks: {
                        maxTicksLimit: 10
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

// 억 단위로 포맷팅 (재무제표용)
function formatNumberInHundredMillion(num) {
    if (num === '-' || num === null || num === undefined) return '-';
    if (typeof num === 'string') return num;
    const inHundredMillion = num / 100000000; // 억 단위로 변환
    return inHundredMillion.toLocaleString('ko-KR', { 
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    }) + '억';
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
    // DOM 요소 선택
    chatMessages = document.getElementById('chatMessages');
    userInput = document.getElementById('userInput');
    sendButton = document.getElementById('sendButton');
    imageUploadInput = document.getElementById('imageUploadInput');
    imageUploadButton = document.getElementById('imageUploadButton');
    
    // 요소가 존재하는지 확인
    if (!chatMessages || !userInput || !sendButton || !imageUploadInput || !imageUploadButton) {
        console.error('필수 DOM 요소를 찾을 수 없습니다.');
        return;
    }
    
    // 이벤트 리스너 등록
    sendButton.addEventListener('click', sendMessage);

    imageUploadButton.addEventListener('click', () => {
        imageUploadInput.click();
    });

    imageUploadInput.addEventListener('change', (event) => {
        const target = event.target;
        const file = target.files && target.files[0];
        if (file) {
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
});

