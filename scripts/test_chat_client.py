import json
import sys

import requests


def main():
    if len(sys.argv) < 2:
        print("사용법: python scripts/test_chat_client.py \"질문 내용\"")
        sys.exit(1)

    message = sys.argv[1]
    url = "http://localhost:5000/api/test/chat"

    response = requests.post(
        url,
        headers={"Content-Type": "application/json"},
        data=json.dumps({"message": message}),
        timeout=20,
    )
    response.raise_for_status()

    data = response.json()
    print(json.dumps(data, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

