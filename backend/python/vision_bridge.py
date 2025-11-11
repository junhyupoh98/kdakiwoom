import io
import json
import os
import re
from dataclasses import dataclass
from typing import Dict, Optional, Tuple

from dotenv import load_dotenv
from google.cloud import vision
from google.cloud.vision_v1 import types as vision_types
from PIL import Image

try:
    import google.generativeai as genai
except ImportError:  # pragma: no cover - 설치 누락 시 호출 영역에서 처리
    genai = None

# 환경 변수 로드 (프로젝트 루트 .env)
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".env"))


GEMINI_JSON_GUIDE = """{
  "object": "여기에 주요 물체 이름 입력 (예: 노트북)",
  "brand": "여기에 소비자에게 알려진 브랜드 이름 입력 (예: 몽쉘)",
  "company": "해당 브랜드를 소유/제조하는 실제 법인명 입력 (예: 롯데웰푸드)",
  "company_market": "해당 법인이 상장된 시장 이름 (예: KRX, NASDAQ, 비상장)",
  "company_ticker": "해당 법인의 티커(종목코드). 비상장이라면 '비상장'으로 기입"
}"""

GEMINI_PROMPT_IMAGE = f"""이 이미지를 분석하여 다음 JSON 형식으로 답변해주세요.

{GEMINI_JSON_GUIDE}

추가 지침:
- 이미지에서 가장 중심이 되는 물체를 우선적으로 판단하세요.
- 텍스트나 배경 요소는 보조 정보입니다.
- 브랜드를 확인하면 해당 브랜드를 소유/제조하는 실제 법인명을 정확히 기입하세요.
- 상장된 회사라면 company_market에는 거래소, company_ticker에는 정확한 티커를 적으세요. 비상장이면 두 필드 모두 "비상장"으로 기입하고, 확실하지 않으면 null로 두세요.
- 추측하거나 부정확한 정보를 제공하지 마세요.
"""

GEMINI_PROMPT_TEXT = f"""다음 Google Cloud Vision 분석 결과를 기반으로 이미지 속 주요 물체와 그 브랜드/기업 정보를 JSON 형식으로만 응답하세요.

Vision 분석 요약은 신뢰도가 높은 순으로 정리되어 있습니다.

JSON 형식:
{GEMINI_JSON_GUIDE}

지침:
- Vision 라벨/객체/로고 정보를 중심으로 브랜드를 판단하세요.
- 브랜드가 확인되면 해당 브랜드를 실제로 보유한 법인명과 상장 정보를 정확히 기입하세요.
- 확실하지 않다면 company, company_market, company_ticker는 null로 남겨두세요.
- JSON 외 다른 텍스트를 포함하지 마세요.
"""

MODEL_CANDIDATES = [
    "gemini-2.5-pro-preview-03-25",
    "gemini-2.5-pro-preview",
    "gemini-1.5-pro",
    "gemini-1.5-flash",
    "gemini-pro",
]


class VisionGeminiError(Exception):
    """Vision 또는 Gemini 호출 실패"""


def _configure_gemini() -> None:
    if genai is None:
        raise VisionGeminiError("google-generativeai 패키지가 설치되지 않았습니다.")

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise VisionGeminiError("GEMINI_API_KEY 환경 변수가 설정되지 않았습니다.")

    genai.configure(api_key=api_key)


def _extract_json(response_text: str) -> Dict:
    if not response_text:
        raise VisionGeminiError("Gemini 응답이 비어 있습니다.")

    match = re.search(r"\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}", response_text, flags=re.DOTALL)
    if not match:
        raise VisionGeminiError(f"JSON을 찾을 수 없습니다: {response_text[:200]}")

    try:
        return json.loads(match.group(0))
    except json.JSONDecodeError as exc:  # pragma: no cover - Gemini 응답 오류
        raise VisionGeminiError(f"JSON 파싱 오류: {exc}") from exc


def _summarize_vision_response(response) -> str:
    parts = []

    if getattr(response, "label_annotations", None):
        labels = sorted(response.label_annotations, key=lambda l: l.score, reverse=True)
        parts.append(
            "Labels: "
            + ", ".join(f"{label.description} ({label.score:.0%})" for label in labels[:5])
        )

    if getattr(response, "localized_object_annotations", None):
        objects = sorted(response.localized_object_annotations, key=lambda o: o.score, reverse=True)
        parts.append(
            "Objects: "
            + ", ".join(f"{obj.name} ({obj.score:.0%})" for obj in objects[:5])
        )

    if getattr(response, "logo_annotations", None):
        logos = sorted(response.logo_annotations, key=lambda l: l.score, reverse=True)
        parts.append(
            "Logos: "
            + ", ".join(f"{logo.description} ({logo.score:.0%})" for logo in logos[:5])
        )

    if getattr(response, "text_annotations", None):
        text = response.text_annotations[0].description.strip()
        if text:
            preview = text.replace("\n", " ")
            if len(preview) > 300:
                preview = preview[:300] + "..."
            parts.append(f"OCR Text: {preview}")

    return "\n".join(parts) if parts else "Vision API에서 유의미한 정보를 찾지 못했습니다."


def _call_gemini_with_text(summary: str) -> Tuple[Optional[Dict], Optional[str], Optional[str]]:
    try:
        _configure_gemini()
    except VisionGeminiError as exc:
        return None, None, str(exc)

    for model_name in MODEL_CANDIDATES:
        try:
            model = genai.GenerativeModel(model_name)
            response = model.generate_content(f"{GEMINI_PROMPT_TEXT}\n\nVision 분석 요약:\n{summary}")
            data = _extract_json(response.text.strip())
            return data, model_name, None
        except Exception as exc:  # pragma: no cover - Gemini 호출 실패 시 폴백
            last_error = str(exc)
    return None, None, last_error  # type: ignore[name-defined]


def _call_gemini_with_image(image_bytes: bytes) -> Tuple[Optional[Dict], Optional[str], Optional[str]]:
    try:
        _configure_gemini()
    except VisionGeminiError as exc:
        return None, None, str(exc)

    try:
        pil_image = Image.open(io.BytesIO(image_bytes))
    except Exception as exc:
        return None, None, f"이미지 로드 실패: {exc}"

    for model_name in MODEL_CANDIDATES:
        try:
            model = genai.GenerativeModel(model_name)
            response = model.generate_content([GEMINI_PROMPT_IMAGE, pil_image])
            data = _extract_json(response.text.strip())
            return data, model_name, None
        except Exception as exc:  # pragma: no cover
            last_error = str(exc)
    return None, None, last_error  # type: ignore[name-defined]


def analyze_product_from_image(image_bytes: bytes) -> Dict:
    """
    Vision API + Gemini(텍스트) 기반으로 제품/브랜드 정보를 추출한다.
    실패 시 Gemini 직접 이미지 분석 결과를 함께 반환한다.

    Returns:
        {
            "vision_summary": str,
            "primary": {...},  # Vision → Gemini 결과
            "fallback": {...}, # Gemini 직접 분석 결과 (옵션)
            "used_fallback": bool,
        }
    """

    client = vision.ImageAnnotatorClient()
    image = vision_types.Image(content=image_bytes)
    features = [
        {"type_": vision_types.Feature.Type.LABEL_DETECTION},
        {"type_": vision_types.Feature.Type.TEXT_DETECTION},
        {"type_": vision_types.Feature.Type.LOGO_DETECTION},
        {"type_": vision_types.Feature.Type.OBJECT_LOCALIZATION},
    ]

    vision_response = client.annotate_image({"image": image, "features": features})
    summary = _summarize_vision_response(vision_response)

    primary_data, primary_model, primary_error = _call_gemini_with_text(summary)
    primary_result = {
        "model": primary_model,
        "object": None,
        "brand": None,
        "company": None,
        "company_market": None,
        "company_ticker": None,
        "error": primary_error,
    }
    if primary_data:
        primary_result.update(
            {
                "object": primary_data.get("object"),
                "brand": primary_data.get("brand"),
                "company": primary_data.get("company"),
                "company_market": primary_data.get("company_market"),
                "company_ticker": primary_data.get("company_ticker"),
            }
        )

    fallback_result = None
    used_fallback = False

    if primary_error or not primary_data:
        fallback_data, fallback_model, fallback_error = _call_gemini_with_image(image_bytes)
        fallback_result = {
            "model": fallback_model,
            "object": None,
            "brand": None,
            "company": None,
            "company_market": None,
            "company_ticker": None,
            "error": fallback_error,
        }
        if fallback_data:
            fallback_result.update(
                {
                    "object": fallback_data.get("object"),
                    "brand": fallback_data.get("brand"),
                    "company": fallback_data.get("company"),
                    "company_market": fallback_data.get("company_market"),
                    "company_ticker": fallback_data.get("company_ticker"),
                }
            )
        used_fallback = bool(fallback_data and not primary_data)

    return {
        "vision_summary": summary,
        "primary": primary_result,
        "fallback": fallback_result,
        "used_fallback": used_fallback,
    }



