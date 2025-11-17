/**
 * 유틸리티 함수 모듈
 * 포맷팅, 정규화, 검증 등
 */

import { MARKET_ALIAS_MAP, SUPPORTED_MARKETS } from './constants.js';

// ============= HTML/문자열 처리 =============
export function escapeHtml(str) {
    str = String(str);
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

export function formatVisionValue(value) {
    if (value === null || value === undefined) return '-';
    const stringValue = String(value).trim();
    if (!stringValue || stringValue.toLowerCase() === 'null') return '-';
    return escapeHtml(stringValue);
}

// ============= 숫자 포맷팅 =============
export function formatNumber(num) {
    if (num === '-' || num === null || num === undefined) return '-';
    if (typeof num === 'string') return num;
    return num.toLocaleString('ko-KR');
}

export function formatNumberInHundredMillion(num, currency = 'KRW') {
    if (num === null || num === undefined || isNaN(num)) return '-';
    
    const absNum = Math.abs(num);
    const sign = num < 0 ? '-' : '';
    
    if (currency === 'KRW' || currency === '₩' || currency === 'KRW') {
        // 한국 원화
        if (absNum >= 1_0000_0000) { // 1조 이상
            return `${sign}${(absNum / 1_0000_0000).toFixed(2)}조원`;
        } else if (absNum >= 1_0000) { // 1억 이상
            return `${sign}${(absNum / 1_0000).toFixed(2)}억원`;
        } else if (absNum >= 1) { // 1만원 이상
            return `${sign}${(absNum).toFixed(2)}만원`;
        } else {
            return `${sign}${absNum.toFixed(0)}원`;
        }
    } else {
        // 외화 (USD 등)
        const currencySymbol = currency === 'USD' || currency === '$' ? '$' : currency;
        
        // 외화도 한국식 단위로 표시
        if (absNum >= 1_0000_0000) { // 1조 이상
            return `${currencySymbol}${sign}${(absNum / 1_0000_0000).toFixed(2)}조`;
        } else if (absNum >= 1_0000) { // 1억 이상
            return `${currencySymbol}${sign}${(absNum / 1_0000).toFixed(2)}억`;
        } else {
            return `${currencySymbol}${sign}${absNum.toFixed(2)}M`;
        }
    }
}

export function formatNumberForChartAxis(num) {
    if (num >= 1_0000_0000) {
        return (num / 1_0000_0000).toFixed(1) + '조';
    } else if (num >= 1_0000) {
        return (num / 1_0000).toFixed(0) + '억';
    } else {
        return num.toFixed(0);
    }
}

// ============= 시장/티커 정규화 =============
export function normalizeMarketName(value) {
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

export function sanitizeTicker(value) {
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

// ============= 회사명 정규화 (빙고용) =============
export function normalizeCompanyName(name) {
    if (!name) return '';
    return String(name)
        .toLowerCase()
        .replace(/주식회사|㈜|\(주\)|co\.|ltd\.|inc\.|corp\./gi, '')
        .replace(/\s+/g, '')
        .replace(/corporation|corp|inc|ltd/gi, '')
        .trim();
}

// ============= localStorage 관리 =============
export function addFavoriteToStorage(symbol, name) {
    let favorites = JSON.parse(localStorage.getItem('favoriteStocks') || '[]');
    
    // 중복 체크
    if (!favorites.find(f => f.symbol === symbol)) {
        favorites.push({ symbol, name, addedAt: new Date().toISOString() });
        localStorage.setItem('favoriteStocks', JSON.stringify(favorites));
    }
}

export function removeFavoriteFromStorage(symbol) {
    let favorites = JSON.parse(localStorage.getItem('favoriteStocks') || '[]');
    favorites = favorites.filter(f => f.symbol !== symbol);
    localStorage.setItem('favoriteStocks', JSON.stringify(favorites));
}

export function checkIfFavorite(symbol) {
    const favorites = JSON.parse(localStorage.getItem('favoriteStocks') || '[]');
    return favorites.some(f => f.symbol === symbol);
}

export function getFavoriteStocks() {
    return JSON.parse(localStorage.getItem('favoriteStocks') || '[]');
}

// ============= Lucide 아이콘 초기화 =============
export function initLucideIcons() {
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

// ============= 메시지 파싱 =============
export function parseMultipleStocks(message) {
    const words = message.split(/[\s,]+/);
    const stocks = [];
    for (const word of words) {
        const cleaned = word.trim();
        if (cleaned && cleaned.length >= 1) {
            stocks.push(cleaned);
        }
    }
    return stocks;
}

