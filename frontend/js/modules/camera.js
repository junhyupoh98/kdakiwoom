/**
 * 카메라 기능 모듈
 * 웹캠/카메라 캡처 기능
 */

// 카메라 스트림 저장
let currentStream = null;

// ============= 카메라 모달 열기/닫기 =============

export async function openCameraModal() {
    const modal = document.getElementById('cameraModal');
    const video = document.getElementById('cameraVideo');
    
    if (!modal || !video) return;
    
    try {
        // 카메라 접근 요청 (환경 카메라 우선 - 모바일 후면 카메라)
        const constraints = {
            video: {
                facingMode: { ideal: 'environment' },
                width: { ideal: 1920 },
                height: { ideal: 1080 }
            }
        };
        
        currentStream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = currentStream;
        video.play();
        
        // 모달 표시
        modal.style.display = 'flex';
        
    } catch (error) {
        console.error('카메라 접근 오류:', error);
        alert('카메라에 접근할 수 없습니다. 권한을 확인해주세요.');
    }
}

export function closeCameraModal() {
    const modal = document.getElementById('cameraModal');
    const video = document.getElementById('cameraVideo');
    
    // 카메라 스트림 중지
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
        currentStream = null;
    }
    
    if (video) {
        video.srcObject = null;
    }
    
    if (modal) {
        modal.style.display = 'none';
    }
}

// ============= 사진 캡처 =============

export function capturePhoto() {
    const video = document.getElementById('cameraVideo');
    const canvas = document.getElementById('cameraCanvas');
    
    if (!video || !canvas) return;
    
    // Canvas 크기를 비디오 표시 크기로 설정
    const displayWidth = video.clientWidth;
    const displayHeight = video.clientHeight;
    canvas.width = displayWidth;
    canvas.height = displayHeight;
    
    const ctx = canvas.getContext('2d');
    
    // 비디오의 실제 크기
    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;
    
    // 비디오 비율
    const videoAspectRatio = videoWidth / videoHeight;
    const displayAspectRatio = displayWidth / displayHeight;
    
    // object-fit: cover 효과 재현 (보이는 부분만 캡처)
    let sourceX = 0;
    let sourceY = 0;
    let sourceWidth = videoWidth;
    let sourceHeight = videoHeight;
    
    if (videoAspectRatio > displayAspectRatio) {
        // 비디오가 더 넓음 → 좌우 크롭
        sourceWidth = videoHeight * displayAspectRatio;
        sourceX = (videoWidth - sourceWidth) / 2;
    } else {
        // 비디오가 더 높음 → 상하 크롭
        sourceHeight = videoWidth / displayAspectRatio;
        sourceY = (videoHeight - sourceHeight) / 2;
    }
    
    // 보이는 영역만 그리기
    ctx.drawImage(
        video,
        sourceX, sourceY, sourceWidth, sourceHeight,
        0, 0, displayWidth, displayHeight
    );
    
    // Canvas를 Blob으로 변환
    canvas.toBlob((blob) => {
        if (blob) {
            // Blob을 File 객체로 변환
            const file = new File([blob], 'camera-capture.jpg', { type: 'image/jpeg' });
            
            // 카메라 모달 닫기
            closeCameraModal();
            
            // 이미지 분석 호출
            if (window.handleImageFile) {
                window.handleImageFile(file);
            }
        }
    }, 'image/jpeg', 0.95);
}

// ============= 앨범에서 선택 =============

export function openAlbum() {
    closeCameraModal();
    
    const imageUploadInput = document.getElementById('imageUploadInput');
    if (imageUploadInput) {
        imageUploadInput.click();
    }
}

// ============= 초기화 =============

export function initCamera() {
    const cameraCloseBtn = document.getElementById('cameraCloseBtn');
    const cameraCaptureBtn = document.getElementById('cameraCaptureBtn');
    const cameraAlbumBtn = document.getElementById('cameraAlbumBtn');
    const landingCameraFloatingButton = document.getElementById('landingCameraFloatingButton');
    
    if (cameraCloseBtn) {
        cameraCloseBtn.addEventListener('click', closeCameraModal);
    }
    
    if (cameraCaptureBtn) {
        cameraCaptureBtn.addEventListener('click', capturePhoto);
    }
    
    if (cameraAlbumBtn) {
        cameraAlbumBtn.addEventListener('click', openAlbum);
    }
    
    if (landingCameraFloatingButton) {
        landingCameraFloatingButton.addEventListener('click', openCameraModal);
    }
}

