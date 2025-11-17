/**
 * 차트 렌더링 모듈
 * Chart.js를 사용한 다양한 차트 렌더링
 */

import { CHART_COLORS } from './constants.js';
import { formatNumber, formatNumberForChartAxis, formatNumberInHundredMillion } from './utils.js';

// 차트 인스턴스 저장소 (메모리 누수 방지)
export const chartInstances = {};

// ============= 메인 주가 차트 (빨간색) =============
export function renderChart(canvasId, chartData) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !chartData.data || chartData.data.length === 0) {
        return;
    }
    
    // 기존 차트 인스턴스 파괴
    if (chartInstances[canvasId]) {
        chartInstances[canvasId].destroy();
    }
    
    const ctx = canvas.getContext('2d');
    const labels = chartData.data.map(item => {
        const date = new Date(item.date);
        return `${date.getMonth() + 1}/${date.getDate()}`;
    });
    const prices = chartData.data.map(item => item.close);
    
    chartInstances[canvasId] = new Chart(ctx, {
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

// ============= 사업부문별 매출 차트 (도넛) =============
export function renderSegmentChart(canvasId, segments, currency) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !segments || Object.keys(segments).length === 0) {
        return;
    }

    // 기존 차트 파괴
    if (chartInstances[canvasId]) {
        chartInstances[canvasId].destroy();
    }

    const ctx = canvas.getContext('2d');
    const labels = Object.keys(segments);
    const data = Object.values(segments);
    const totalRevenue = data.reduce((sum, val) => sum + val, 0);
    
    const isMobile = window.innerWidth <= 768;

    // Center text plugin
    const centerTextPlugin = {
        id: 'centerText',
        afterDraw: (chart) => {
            const { ctx, chartArea: { width, height } } = chart;
            ctx.save();

            // 총 매출액 텍스트
            const titleText = '총 매출액';
            ctx.font = isMobile ? 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Noto Sans KR", sans-serif' 
                                : 'bold 14px -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Noto Sans KR", sans-serif';
            ctx.fillStyle = '#64748b';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            const centerX = width / 2;
            const centerY = height / 2;
            
            ctx.fillText(titleText, centerX, centerY - (isMobile ? 24 : 28));

            // 매출액 금액
            let revenueText = '';
            const currencySymbol = currency === 'KRW' || currency === '₩' ? '' : 
                                  (currency === 'USD' || currency === '$' ? '$' : currency);
            
            if (currency === 'KRW' || currency === '₩') {
                // 한국 원화
                const revenueInHundredMillion = totalRevenue / 10000;
                if (revenueInHundredMillion >= 10000) {
                    const formatted = (revenueInHundredMillion / 10000).toFixed(2);
                    revenueText = `${formatted}조원`;
                } else if (revenueInHundredMillion >= 1) {
                    const formatted = revenueInHundredMillion.toFixed(2);
                    revenueText = `${formatted}억원`;
                } else {
                    revenueText = `${totalRevenue.toFixed(0)}만원`;
                }
            } else {
                // 외화 (USD 등) - 한국식 단위 사용
                const revenueInHundredMillionUSD = totalRevenue / 100000000;
                if (revenueInHundredMillionUSD >= 10000) {
                    const formatted = (revenueInHundredMillionUSD / 10000).toLocaleString('ko-KR', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                    });
                    revenueText = `${currencySymbol}${formatted}조`;
                } else if (revenueInHundredMillionUSD >= 1) {
                    const formatted = revenueInHundredMillionUSD.toLocaleString('ko-KR', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                    });
                    revenueText = `${currencySymbol}${formatted}억`;
                } else {
                    const revenueInMillionUSD = totalRevenue / 1000000;
                    const formatted = revenueInMillionUSD.toFixed(2);
                    revenueText = `${currencySymbol}${formatted}M`;
                }
            }

            ctx.font = isMobile ? 'bold 16px -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Noto Sans KR", sans-serif' 
                                : 'bold 20px -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Noto Sans KR", sans-serif';
            ctx.fillStyle = '#1e293b';
            ctx.fillText(revenueText, centerX, centerY);

            // 부문 개수
            const countText = `${labels.length}개 부문`;
            ctx.font = isMobile ? '600 11px -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Noto Sans KR", sans-serif' 
                                : '600 13px -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Noto Sans KR", sans-serif';
            ctx.fillStyle = '#64748b';
            ctx.fillText(countText, centerX, centerY + (isMobile ? 24 : 28));

            ctx.restore();
        }
    };

    chartInstances[canvasId] = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: CHART_COLORS.vibrant,
                hoverBackgroundColor: CHART_COLORS.vibrantHover,
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
            maintainAspectRatio: true,
            cutout: '65%',
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom',
                    align: 'start',
                    labels: {
                        padding: isMobile ? 12 : 16,
                        font: {
                            size: isMobile ? 13 : 14,
                            weight: '600',
                            family: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Noto Sans KR", sans-serif'
                        },
                        color: '#1e293b',
                        usePointStyle: true,
                        pointStyle: 'circle',
                        boxWidth: isMobile ? 12 : 14,
                        boxHeight: isMobile ? 12 : 14,
                        generateLabels: function(chart) {
                            const data = chart.data;
                            if (data.labels.length && data.datasets.length) {
                                return data.labels.map((label, i) => {
                                    const value = data.datasets[0].data[i];
                                    const percentage = ((value / totalRevenue) * 100).toFixed(1);
                                    let displayLabel = `${label} (${percentage}%)`;
                                    
                                    // 모바일에서 너무 긴 레이블 처리
                                    if (isMobile && label.length > 18) {
                                        displayLabel = `${label.substring(0, 15)}... (${percentage}%)`;
                                    }
                                    
                                    return {
                                        text: displayLabel,
                                        fillStyle: CHART_COLORS.vibrant[i],
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
                    backgroundColor: 'rgba(0, 0, 0, 0.85)',
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    titleFont: {
                        size: 14,
                        weight: '700'
                    },
                    bodyFont: {
                        size: 13,
                        weight: '600'
                    },
                    padding: 12,
                    cornerRadius: 8,
                    displayColors: true,
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.parsed;
                            const percentage = ((value / totalRevenue) * 100).toFixed(1);
                            const formatted = formatNumberInHundredMillion(value, currency);
                            return `${label}: ${formatted} (${percentage}%)`;
                        }
                    }
                }
            },
            animation: {
                animateRotate: true,
                animateScale: true,
                duration: 1000,
                easing: 'easeInOutQuart'
            }
        },
        plugins: [centerTextPlugin]
    });
}

// ============= 재무제표 차트 (막대) =============
export function renderFinancialChart(canvasId, chartData, currency = 'KRW') {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    // 기존 차트 파괴
    if (chartInstances[canvasId]) {
        chartInstances[canvasId].destroy();
    }

    const ctx = canvas.getContext('2d');
    const isMobile = window.innerWidth <= 768;

    chartInstances[canvasId] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: chartData.labels,
            datasets: [{
                label: chartData.label,
                data: chartData.data,
                backgroundColor: 'rgba(124, 58, 237, 0.8)',
                hoverBackgroundColor: 'rgba(124, 58, 237, 1)',
                borderColor: 'rgba(124, 58, 237, 1)',
                borderWidth: 2,
                borderRadius: 8,
                borderSkipped: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                title: {
                    display: true,
                    text: `단위: ${currency === 'KRW' ? '억원' : '백만 USD'}`,
                    align: 'end',
                    font: {
                        size: isMobile ? 11 : 12,
                        weight: '600'
                    },
                    color: '#64748b',
                    padding: {
                        top: 0,
                        bottom: 10
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.85)',
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    titleFont: {
                        size: 14,
                        weight: '700'
                    },
                    bodyFont: {
                        size: 13,
                        weight: '600'
                    },
                    padding: 12,
                    cornerRadius: 8,
                    displayColors: false,
                    callbacks: {
                        label: function(context) {
                            return formatNumberInHundredMillion(context.parsed.y, currency);
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(124, 58, 237, 0.1)',
                        drawBorder: false
                    },
                    ticks: {
                        callback: function(value) {
                            return formatNumberForChartAxis(value);
                        },
                        font: {
                            size: isMobile ? 10 : 11,
                            weight: '600'
                        },
                        color: '#64748b'
                    }
                },
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        font: {
                            size: isMobile ? 11 : 12,
                            weight: '600'
                        },
                        color: '#1e293b'
                    }
                }
            }
        }
    });
}

// ============= 매매 모달 차트 (Canvas 2D) =============
export function drawTradeChart(canvasId, mockData, isDark = true) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    // 배경 클리어
    ctx.clearRect(0, 0, width, height);

    // 가격 데이터
    const prices = mockData.prices;
    const volumes = mockData.volumes;
    
    // 차트 영역 설정
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
    ctx.strokeStyle = mockData.change >= 0 ? '#5470ff' : '#ff5470';
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

    // 볼륨 바 그리기
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

