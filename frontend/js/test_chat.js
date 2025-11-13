const TEST_CHAT_ENDPOINT = 'http://localhost:5000/api/test/chat';

document.addEventListener('DOMContentLoaded', () => {
    const textarea = document.getElementById('testMessage');
    const sendButton = document.getElementById('sendTestButton');
    const statusLabel = document.getElementById('testStatus');
    const resultBox = document.getElementById('testResult');

    if (!textarea || !sendButton || !statusLabel || !resultBox) {
        console.error('테스트 챗 요소를 찾을 수 없습니다.');
        return;
    }

    const sendTestRequest = async () => {
        const message = textarea.value.trim();
        if (!message) {
            statusLabel.textContent = '메시지를 입력해 주세요.';
            return;
        }

        sendButton.disabled = true;
        statusLabel.textContent = '요청 중...';
        resultBox.textContent = '';

        try {
            const response = await fetch(TEST_CHAT_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ message })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`서버 오류 (${response.status}): ${errorText}`);
            }

            const data = await response.json();
            resultBox.textContent = data.reply || '(응답이 비어 있습니다)';
            statusLabel.textContent = '완료';
        } catch (error) {
            console.error('[테스트 챗 오류]', error);
            statusLabel.textContent = '오류가 발생했습니다.';
            resultBox.textContent = error.message;
        } finally {
            sendButton.disabled = false;
        }
    };

    sendButton.addEventListener('click', sendTestRequest);

    textarea.addEventListener('keydown', (event) => {
        if ((event.key === 'Enter' || event.keyCode === 13) && !event.shiftKey) {
            event.preventDefault();
            sendTestRequest();
        }
    });
});


