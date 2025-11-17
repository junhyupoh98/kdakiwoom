/**
 * 매매 모달 모듈
 * 증권앱 스타일의 매매 화면 (데모용)
 */

import { initLucideIcons } from './utils.js';

// 현재 표시 중인 주식 정보 (Mock Data)
export const currentTradeStock = {
    name: '테슬라',
    ticker: 'TSLA',
    exchange: '나스닥',
    price: 403.0000,
    change: -1.3500,
    changePercent: -0.33,
    favoriteCount: 1125676
};

// Mock 계좌 정보
export const mockAccountInfo = {
    cash: 5000000,
    holdingQuantity: 0,
    averagePrice: 0
};

// ============= 모달 관리 =============

export function openTradeModal() {
    const modal = document.getElementById('tradeModal');
    if (!modal) return;
    
    // 주식 정보 표시
    document.getElementById('tradeStockName').textContent = currentTradeStock.name;
    document.getElementById('tradeTicker').textContent = currentTradeStock.ticker;
    document.getElementById('tradeExchange').textContent = currentTradeStock.exchange;
    document.getElementById('tradeCurrentPrice').textContent = 
        `$${currentTradeStock.price.toFixed(4)}`;
    
    const priceChangeEl = document.getElementById('tradePriceChange');
    const changeText = `${currentTradeStock.change >= 0 ? '+' : ''}${currentTradeStock.change.toFixed(4)} (${currentTradeStock.change >= 0 ? '+' : ''}${currentTradeStock.changePercent.toFixed(2)}%)`;
    priceChangeEl.textContent = changeText;
    priceChangeEl.className = `trade-price-change ${currentTradeStock.change >= 0 ? 'positive' : 'negative'}`;
    
    // 차트 그리기
    drawMockChart();
    
    modal.style.display = 'block';
    initLucideIcons();
}

export function closeTradeModal() {
    const modal = document.getElementById('tradeModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// ============= Mock 차트 =============

function drawMockChart() {
    const canvas = document.getElementById('tradeChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    // 배경 클리어
    ctx.clearRect(0, 0, width, height);
    
    // Mock 가격 데이터 생성
    const dataPoints = 30;
    const basePrice = currentTradeStock.price;
    const prices = [];
    const volumes = [];
    
    for (let i = 0; i < dataPoints; i++) {
        const randomChange = (Math.random() - 0.5) * 10;
        prices.push(basePrice + randomChange);
        volumes.push(Math.random() * 100000 + 50000);
    }
    
    // 차트 영역
    const padding = { top: 20, right: 40, bottom: 60, left: 10 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    
    // 가격 범위
    const maxPrice = Math.max(...prices);
    const minPrice = Math.min(...prices);
    const priceRange = maxPrice - minPrice;
    
    // 볼륨 범위
    const maxVolume = Math.max(...volumes);
    
    // 가격 라인 그리기
    ctx.beginPath();
    ctx.strokeStyle = currentTradeStock.change >= 0 ? '#5470ff' : '#ff5470';
    ctx.lineWidth = 2;
    
    prices.forEach((price, i) => {
        const x = padding.left + (i / (prices.length - 1)) * chartWidth;
        const y = padding.top + chartHeight - ((price - minPrice) / priceRange) * chartHeight;
        
        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });
    ctx.stroke();
    
    // 볼륨 바
    const barWidth = chartWidth / volumes.length;
    volumes.forEach((volume, i) => {
        const x = padding.left + i * barWidth;
        const barHeight = (volume / maxVolume) * 50;
        const y = padding.top + chartHeight + 10;
        
        ctx.fillStyle = 'rgba(139, 139, 143, 0.3)';
        ctx.fillRect(x, y, barWidth * 0.8, barHeight);
    });
    
    // 그리드 라인
    ctx.strokeStyle = 'rgba(139, 139, 143, 0.2)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        const y = padding.top + (chartHeight / 4) * i;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(padding.left + chartWidth, y);
        ctx.stroke();
        
        // 가격 레이블
        const price = maxPrice - (priceRange / 4) * i;
        ctx.fillStyle = '#8b8b8f';
        ctx.font = '11px -apple-system';
        ctx.textAlign = 'right';
        ctx.fillText(price.toFixed(2), width - 5, y + 4);
    }
}

// ============= 매매 버튼 =============

function handleBuy() {
    alert('매수 기능은 데모용입니다.\n실제 거래는 증권사 앱을 이용해주세요.');
}

function handleSell() {
    alert('매도 기능은 데모용입니다.\n실제 거래는 증권사 앱을 이용해주세요.');
}

// ============= 기간 선택 =============

function handlePeriodChange(period) {
    console.log('기간 변경:', period);
    
    // 모든 버튼에서 active 제거
    document.querySelectorAll('.trade-period-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // 클릭된 버튼에 active 추가
    event.target.classList.add('active');
    
    // 차트 다시 그리기
    drawMockChart();
}

// ============= 초기화 =============

export function initTrade() {
    const tradeBtn = document.querySelector('.quick-action-btn.trade-btn');
    const tradeBackBtn = document.getElementById('tradeBackBtn');
    const tradeCloseBtn = document.getElementById('tradeCloseBtn');
    const tradeBuyBtn = document.querySelector('.trade-buy-btn');
    const tradeSellBtn = document.querySelector('.trade-sell-btn');
    
    if (tradeBtn) {
        tradeBtn.addEventListener('click', openTradeModal);
    }
    
    if (tradeBackBtn) {
        tradeBackBtn.addEventListener('click', closeTradeModal);
    }
    
    if (tradeCloseBtn) {
        tradeCloseBtn.addEventListener('click', closeTradeModal);
    }
    
    if (tradeBuyBtn) {
        tradeBuyBtn.addEventListener('click', handleBuy);
    }
    
    if (tradeSellBtn) {
        tradeSellBtn.addEventListener('click', handleSell);
    }
    
    // 기간 버튼들
    const periodButtons = document.querySelectorAll('.trade-period-btn');
    periodButtons.forEach((btn, index) => {
        btn.addEventListener('click', () => handlePeriodChange(index));
    });
}

