/**
 * 빙고 챌린지 모듈
 * 기업 찾기 빙고 게임 로직
 */

import { BINGO_COMPANIES } from './constants.js';
import { normalizeCompanyName, initLucideIcons } from './utils.js';

// 빙고 상태 (개발 모드: 새로고침 시 리셋)
export let bingoState = BINGO_COMPANIES.map((company, index) => ({
    ...company,
    completed: false,
    completedAt: null,
    index
}));

// ============= 빙고 상태 관리 =============

export function loadBingoState() {
    const saved = localStorage.getItem('bingoState');
    if (saved) {
        try {
            return JSON.parse(saved);
        } catch (e) {
            console.error('빙고 상태 로드 실패:', e);
        }
    }
    return BINGO_COMPANIES.map((company, index) => ({
        ...company,
        completed: false,
        completedAt: null,
        index
    }));
}

export function saveBingoState(state) {
    // 개발 모드: localStorage 저장 비활성화
    console.log('💾 빙고 상태 저장 (개발 모드: 비활성화)', state.filter(s => s.completed).length, '개 완성');
    // 배포 시: localStorage.setItem('bingoState', JSON.stringify(state));
}

export function resetBingo() {
    bingoState = BINGO_COMPANIES.map((company, index) => ({
        ...company,
        completed: false,
        completedAt: null,
        index
    }));
    saveBingoState(bingoState);
    renderBingoGrid();
}

// ============= UI 렌더링 =============

export function renderBingoGrid() {
    const bingoGrid = document.getElementById('bingoGrid');
    if (!bingoGrid) return;
    
    bingoGrid.innerHTML = '';
    
    bingoState.forEach((cell, index) => {
        const cellEl = document.createElement('div');
        cellEl.className = `bingo-cell${cell.completed ? ' completed' : ''}`;
        cellEl.dataset.index = index;
        
        cellEl.innerHTML = `
            <div class="bingo-cell-logo">${cell.emoji}</div>
            <div class="bingo-cell-name">${cell.name}</div>
            <div class="bingo-cell-check">
                <i data-lucide="check" width="16" height="16"></i>
            </div>
        `;
        
        bingoGrid.appendChild(cellEl);
    });
    
    initLucideIcons();
    updateBingoProgress();
}

export function updateBingoProgress() {
    const completedCount = bingoState.filter(cell => cell.completed).length;
    const total = bingoState.length;
    
    // Quick action bar 진행률
    const progressEl = document.getElementById('bingoProgress');
    if (progressEl) {
        progressEl.textContent = `${completedCount}/${total}`;
    }
    
    // 빙고 모달 진행률
    const completedEl = document.getElementById('bingoCompleted');
    if (completedEl) {
        completedEl.textContent = completedCount;
    }
    
    // 상품 상태
    const rewardEl = document.getElementById('bingoReward');
    if (rewardEl) {
        if (completedCount === total) {
            rewardEl.textContent = '🎉 완성!';
            rewardEl.style.color = '#22c55e';
        } else {
            rewardEl.textContent = `${total - completedCount}개 남음`;
        }
    }
}

// ============= 빙고 게임 로직 =============

export function completeCompany(companyName) {
    const normalizedName = normalizeCompanyName(companyName);
    
    // 영문-한글 매핑
    const nameMapping = {
        'samsung': '삼성전자',
        'apple': '애플',
        'apple inc': 'apple',
        'tesla': '테슬라',
        'hyundai': '현대자동차',
        'kakao': '카카오',
        'google': 'google',
        'alphabet': 'google',
        'nvidia': 'nvidia',
        'netflix': 'netflix',
        'nike': 'nike'
    };
    
    // 매핑 테이블에서 찾기
    let matchedName = null;
    for (const [eng, kor] of Object.entries(nameMapping)) {
        if (normalizedName.includes(eng) || companyName.toLowerCase().includes(eng)) {
            matchedName = kor;
            break;
        }
    }
    
    // 빙고판에서 해당 기업 찾기
    const cellIndex = bingoState.findIndex(cell => {
        const cellNormalized = normalizeCompanyName(cell.name);
        
        // 1. 매핑된 이름으로 비교
        if (matchedName && normalizeCompanyName(matchedName) === cellNormalized) {
            return true;
        }
        
        // 2. 정규화된 이름으로 직접 비교
        if (cellNormalized === normalizedName) {
            return true;
        }
        
        // 3. 부분 문자열 비교
        if (normalizedName.length > 2 && cellNormalized.includes(normalizedName)) {
            return true;
        }
        
        // 4. 역방향 부분 문자열 비교
        if (cellNormalized.length > 2 && normalizedName.includes(cellNormalized)) {
            return true;
        }
        
        return false;
    });
    
    if (cellIndex === -1) {
        console.log('빙고판에 없는 기업:', companyName, '(정규화:', normalizedName, ')');
        return false;
    }
    
    if (bingoState[cellIndex].completed) {
        console.log('이미 완성된 칸:', companyName);
        return false;
    }
    
    // 완성 처리
    bingoState[cellIndex].completed = true;
    bingoState[cellIndex].completedAt = new Date().toISOString();
    saveBingoState(bingoState);
    
    // UI 업데이트
    renderBingoGrid();
    
    // 완성 알림 (ui.js에서 import)
    if (window.showBingoNotification) {
        window.showBingoNotification(bingoState[cellIndex]);
    }
    
    // 빙고 완성 체크
    checkBingoComplete();
    
    return true;
}

export function checkBingoComplete() {
    const completedCount = bingoState.filter(cell => cell.completed).length;
    const total = bingoState.length;
    
    if (completedCount === total) {
        // 빙고 완성! 폭죽 효과 + 챗봇 메시지
        if (window.showConfettiEffect) {
            window.showConfettiEffect();
        }
        
        if (window.addMessage) {
            setTimeout(() => {
                window.addMessage(
                    `🎉🎊 축하합니다! 빙고 챌린지를 완성하셨어요! 🎊🎉<br><br>` +
                    `모든 기업을 찾으셨습니다! 대단해요! 🏆`,
                    'bot'
                );
            }, 500);
        }
    }
}

// ============= 모달 관리 =============

export function openBingoModal() {
    const modal = document.getElementById('bingoModal');
    if (modal) {
        modal.style.display = 'flex';
        renderBingoGrid();
    }
}

export function closeBingoModal() {
    const modal = document.getElementById('bingoModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// ============= 초기화 =============

export function initBingo() {
    console.log('🔄 개발 모드: 빙고 상태 초기화됨');
    localStorage.removeItem('bingoState');
    
    // 이벤트 리스너 등록
    const bingoBtn = document.getElementById('bingoBtn');
    const bingoCloseBtn = document.getElementById('bingoCloseBtn');
    const bingoModal = document.getElementById('bingoModal');
    
    if (bingoBtn) {
        bingoBtn.addEventListener('click', openBingoModal);
    }
    
    if (bingoCloseBtn) {
        bingoCloseBtn.addEventListener('click', closeBingoModal);
    }
    
    if (bingoModal) {
        bingoModal.addEventListener('click', (e) => {
            if (e.target === bingoModal) {
                closeBingoModal();
            }
        });
    }
    
    // 초기 진행률 업데이트
    updateBingoProgress();
}

