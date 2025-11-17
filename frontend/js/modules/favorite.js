/**
 * 관심종목 모듈
 * 찜 기능 및 관심종목 모달 관리
 */

import { addFavoriteToStorage, removeFavoriteFromStorage, checkIfFavorite, getFavoriteStocks, initLucideIcons } from './utils.js';

// ============= 관심종목 토글 =============

export function toggleFavorite(button, symbol, name) {
    const isFavorite = button.classList.contains('active');
    
    if (isFavorite) {
        // 관심종목 해제
        button.classList.remove('active');
        button.title = '관심 종목 추가';
        removeFavoriteFromStorage(symbol);
        
        if (window.addMessage) {
            window.addMessage(`"${name}"을(를) 관심종목에서 제거했습니다.`, 'bot');
        }
    } else {
        // 관심종목 추가
        button.classList.add('active');
        button.title = '관심 종목 해제';
        addFavoriteToStorage(symbol, name);
        
        if (window.addMessage) {
            window.addMessage(`"${name}"을(를) 관심종목에 추가했습니다! ⭐`, 'bot');
        }
    }
    
    initLucideIcons();
}

// ============= 관심종목 모달 =============

export function openFavoriteModal() {
    const modal = document.getElementById('favoriteModal');
    if (modal) {
        modal.style.display = 'flex';
        renderFavoriteList();
        initLucideIcons();
    }
}

export function closeFavoriteModal() {
    const modal = document.getElementById('favoriteModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

export function renderFavoriteList() {
    const favoriteList = document.getElementById('favoriteList');
    const favoriteCount = document.getElementById('favoriteCount');
    
    if (!favoriteList || !favoriteCount) return;
    
    // localStorage에서 찜한 종목 가져오기
    const favorites = getFavoriteStocks();
    
    // 개수 업데이트
    favoriteCount.textContent = favorites.length;
    
    // 빈 목록 처리
    if (favorites.length === 0) {
        favoriteList.innerHTML = `
            <div class="favorite-empty">
                <i data-lucide="star-off" width="64" height="64"></i>
                <div class="favorite-empty-title">아직 관심종목이 없어요</div>
                <div class="favorite-empty-desc">마음에 드는 종목을 찜해보세요!</div>
            </div>
        `;
        initLucideIcons();
        return;
    }
    
    // 관심종목 리스트 렌더링
    favoriteList.innerHTML = favorites.map(fav => `
        <div class="favorite-item" data-symbol="${fav.symbol}">
            <div class="favorite-item-left">
                <span class="favorite-star-icon">⭐</span>
                <div class="favorite-item-info">
                    <div class="favorite-item-name">${fav.name}</div>
                    <div class="favorite-item-symbol">${fav.symbol}</div>
                </div>
            </div>
            <div class="favorite-item-actions">
                <button class="favorite-delete-btn" data-symbol="${fav.symbol}">
                    <i data-lucide="trash-2" width="18" height="18"></i>
                </button>
            </div>
        </div>
    `).join('');
    
    // 이벤트 리스너 등록
    const favoriteItems = favoriteList.querySelectorAll('.favorite-item');
    favoriteItems.forEach(item => {
        item.addEventListener('click', async (e) => {
            // 삭제 버튼 클릭 시에는 주가 조회 하지 않음
            if (e.target.closest('.favorite-delete-btn')) {
                return;
            }
            
            const symbol = item.dataset.symbol;
            closeFavoriteModal();
            
            // 주가 조회 (window.fetchStockData 사용)
            if (window.fetchStockData && window.addStockMessage && window.addLoadingMessage && window.removeMessage) {
                const loadingId = window.addLoadingMessage(`${symbol} 정보 로딩중...`);
                try {
                    const stockData = await window.fetchStockData(symbol);
                    window.removeMessage(loadingId);
                    if (stockData) {
                        window.addStockMessage(stockData);
                    } else {
                        window.addMessage(`"${symbol}" 종목 정보를 찾을 수 없습니다.`, 'bot');
                    }
                } catch (error) {
                    window.removeMessage(loadingId);
                    window.addMessage('주가 정보를 가져오는 중 오류가 발생했습니다.', 'bot');
                }
            }
        });
    });
    
    // 삭제 버튼 이벤트
    const deleteButtons = favoriteList.querySelectorAll('.favorite-delete-btn');
    deleteButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const symbol = btn.dataset.symbol;
            const favorite = favorites.find(f => f.symbol === symbol);
            
            if (confirm(`"${favorite?.name || symbol}"을(를) 관심종목에서 제거하시겠습니까?`)) {
                removeFavoriteFromStorage(symbol);
                renderFavoriteList();
            }
        });
    });
    
    initLucideIcons();
}

// ============= 초기화 =============

export function initFavorite() {
    const favoriteBtn = document.querySelector('.quick-action-btn.favorite-btn');
    const favoriteCloseBtn = document.getElementById('favoriteCloseBtn');
    const favoriteModal = document.getElementById('favoriteModal');
    
    if (favoriteBtn) {
        favoriteBtn.addEventListener('click', openFavoriteModal);
    }
    
    if (favoriteCloseBtn) {
        favoriteCloseBtn.addEventListener('click', closeFavoriteModal);
    }
    
    if (favoriteModal) {
        favoriteModal.addEventListener('click', (e) => {
            if (e.target === favoriteModal) {
                closeFavoriteModal();
            }
        });
    }
}

// Export for global access
export { checkIfFavorite };

