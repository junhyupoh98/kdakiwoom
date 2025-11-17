/**
 * 상수 정의 모듈
 * API URLs, 시장 매핑, 응답 규칙 등
 */

// ============= 환경 설정 =============
export const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

// API Base URLs
export const API_BASE_URL = isDevelopment 
    ? 'http://localhost:3000/api' 
    : '/api';

export const PYTHON_API_URL = isDevelopment 
    ? 'http://localhost:5000/api' 
    : '/api';

// ============= 시장 설정 =============
export const MARKET_ALIAS_MAP = {
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

export const SUPPORTED_MARKETS = new Set(['NASDAQ', 'NYSE', 'KRX', 'XETRA', 'HKEX', 'SSE', 'SZSE', 'TWSE']);

// 실제로 주가 데이터를 가져올 수 있는 시장 (한국 + 미국만)
export const DATA_AVAILABLE_MARKETS = new Set(['NASDAQ', 'NYSE', 'KRX', 'KOSPI', 'KOSDAQ']);

// ============= 챗봇 응답 =============
export const responses = {
    '안녕': '안녕하세요!',
    '안녕하세요': '안녕하세요! 주식 정보를 검색해드립니다.',
    '반가워': '반가워요!',
    '이름': '저는 주식 정보 챗봇입니다.',
    '도움말': '종목명이나 심볼을 입력하면 주가 정보를 알려드립니다.',
    '고마워': '천만에요!',
    '감사': '별말씀을요!',
    '종료': '안녕히 가세요!',
};

// ============= 빙고 설정 =============
export const BINGO_COMPANIES = [
    { symbol: '삼성전자', name: '삼성전자', emoji: '📱' },
    { symbol: 'AAPL', name: 'Apple', emoji: '🍎' },
    { symbol: 'TSLA', name: 'Tesla', emoji: '🚗' },
    { symbol: '현대차', name: '현대자동차', emoji: '🚙' },
    { symbol: 'NVDA', name: 'NVIDIA', emoji: '🎮' },
    { symbol: 'NFLX', name: 'Netflix', emoji: '🎬' },
    { symbol: '카카오', name: '카카오', emoji: '💬' },
    { symbol: 'GOOGL', name: 'Google', emoji: '🔍' },
    { symbol: 'NKE', name: 'Nike', emoji: '👟' }
];

// ============= 차트 색상 =============
export const CHART_COLORS = {
    primary: '#7c3aed',
    secondary: '#a855f7',
    success: '#10b981',
    danger: '#ef4444',
    warning: '#f59e0b',
    info: '#3b82f6',
    
    // Vibrant colors for doughnut chart
    vibrant: [
        'rgba(124, 58, 237, 0.9)',
        'rgba(168, 85, 247, 0.9)',
        'rgba(139, 92, 246, 0.9)',
        'rgba(192, 132, 252, 0.9)',
        'rgba(233, 213, 255, 0.9)',
        'rgba(147, 51, 234, 0.9)',
        'rgba(126, 34, 206, 0.9)',
        'rgba(107, 33, 168, 0.9)',
    ],
    
    // Hover colors
    vibrantHover: [
        'rgba(124, 58, 237, 1)',
        'rgba(168, 85, 247, 1)',
        'rgba(139, 92, 246, 1)',
        'rgba(192, 132, 252, 1)',
        'rgba(233, 213, 255, 1)',
        'rgba(147, 51, 234, 1)',
        'rgba(126, 34, 206, 1)',
        'rgba(107, 33, 168, 1)',
    ]
};

