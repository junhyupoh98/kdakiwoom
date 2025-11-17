/**
 * API 호출 모듈
 * 백엔드 API와의 모든 통신 처리
 */

import { API_BASE_URL, PYTHON_API_URL } from './constants.js';

// ============= 주가 정보 API =============

export async function fetchStockData(query) {
    try {
        const response = await fetch(`${API_BASE_URL}/stock/${encodeURIComponent(query)}`);
        
        if (!response.ok) {
            if (response.status === 404) {
                return null;
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

export async function fetchChartData(symbol, period = '1m') {
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

export async function fetchStockNews(symbol) {
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

export async function fetchStockFinancials(symbol) {
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

// ============= 시장 정보 API =============

export async function loadMarketIndices(market) {
    try {
        const response = await fetch(`${PYTHON_API_URL}/market-indices/${market}`);
        if (!response.ok) {
            throw new Error(`시장 지수 조회 오류 (${response.status})`);
        }
        return await response.json();
    } catch (error) {
        console.error('시장 지수 조회 오류:', error);
        return null;
    }
}

// ============= AI/NLP API =============

export async function requestStockParse(input) {
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

export async function requestFinanceQA(question) {
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

// ============= Vision API =============

export async function requestVisionAnalysis(file, mode = 'quick') {
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

