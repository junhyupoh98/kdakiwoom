"""
Google Cloud Vision API와 Gemini를 활용한 이미지 분석 웹 애플리케이션
Streamlit 기반 UI
"""

import io
import json
import os
import re

import streamlit as st
from dotenv import load_dotenv
from google.cloud import vision
from google.cloud.vision_v1 import types as vision_types

load_dotenv()

GEMINI_JSON_GUIDE = """{
  "object": "여기에 주요 물체 이름 입력 (예: 노트북)",
  "brand": "여기에 소비자에게 알려진 브랜드 이름 입력 (예: 몽쉘)",
  "company": "해당 브랜드를 소유/제조하는 실제 법인명 입력 (예: 롯데웰푸드)",
  "company_market": "해당 법인이 상장된 시장 이름 (예: KRX, NASDAQ, 비상장)",
  "company_ticker": "해당 법인의 티커(종목코드). 비상장이라면 '비상장'으로 기입"
}

중요:
- object: 이미지에서 보이는 주요 물체나 제품의 일반적인 이름 (예: 노트북, 자동차, 스마트폰, 운동화 등)
- brand: 소비자가 인지하는 브랜드명 (없으면 null)
- company: 브랜드를 실제로 제조/판매하는 법인명(그룹명보다 구체적인 법인명).
- company_market & company_ticker: 상장 시장 및 종목코드를 정확히 기입하세요. 비상장이라면 두 필드 모두 "비상장"으로 작성하고, 확실하지 않으면 null.
- brand나 company 관련 정보는 신뢰할 수 있는 자료를 참고해 검증한 뒤 답변하세요.
- 추측하거나 부정확한 정보를 제공하지 마세요.
- JSON 형식만 반환하세요."""


@st.cache_resource
def init_vision_client():
    """Google Cloud Vision 클라이언트를 초기화"""
    try:
        credentials_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
        if credentials_path and not os.path.isabs(credentials_path):
            credentials_path = os.path.join(os.getcwd(), credentials_path)

        if credentials_path and not os.path.exists(credentials_path):
            st.error(f"❌ 서비스 계정 키 파일을 찾을 수 없습니다: {credentials_path}")
            return None

        return vision.ImageAnnotatorClient()
    except Exception as e:
        st.error(f"❌ Google Cloud Vision 클라이언트 초기화 실패: {str(e)}")
        return None


def analyze_image(client, image_content, options):
    """Google Cloud Vision을 사용하여 이미지 분석"""
    image = vision_types.Image(content=image_content)

    features = []
    if options.get('labels'):
        features.append({'type_': vision_types.Feature.Type.LABEL_DETECTION})
    if options.get('text'):
        features.append({'type_': vision_types.Feature.Type.TEXT_DETECTION})
    if options.get('objects'):
        features.append({'type_': vision_types.Feature.Type.OBJECT_LOCALIZATION})
    if options.get('faces'):
        features.append({'type_': vision_types.Feature.Type.FACE_DETECTION})
    if options.get('landmarks'):
        features.append({'type_': vision_types.Feature.Type.LANDMARK_DETECTION})
    if options.get('logos'):
        features.append({'type_': vision_types.Feature.Type.LOGO_DETECTION})
    if options.get('safe_search'):
        features.append({'type_': vision_types.Feature.Type.SAFE_SEARCH_DETECTION})

    if not features:
        return None

    return client.annotate_image({'image': image, 'features': features})


def extract_json_from_response_text(response_text: str):
    """Gemini 응답에서 JSON 추출"""
    if not response_text:
        return None, "빈 응답입니다."

    json_match = re.search(r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}', response_text, re.DOTALL)
    if not json_match:
        return None, f'JSON을 찾을 수 없습니다: {response_text[:200]}'

    json_str = json_match.group(0)
    try:
        return json.loads(json_str), None
    except json.JSONDecodeError as exc:
        return None, f'JSON 파싱 오류: {str(exc)}'


def summarize_vision_response(response, options):
    """Vision API 응답을 텍스트로 요약"""
    parts = []

    if options.get('labels') and getattr(response, "label_annotations", None):
        labels = sorted(response.label_annotations, key=lambda l: l.score, reverse=True)
        top_labels = [f"{label.description} ({label.score:.0%})" for label in labels[:5]]
        parts.append("라벨 후보: " + ", ".join(top_labels))

    if options.get('objects') and getattr(response, "localized_object_annotations", None):
        objects = sorted(response.localized_object_annotations, key=lambda o: o.score, reverse=True)
        top_objects = [f"{obj.name} ({obj.score:.0%})" for obj in objects[:5]]
        parts.append("객체 후보: " + ", ".join(top_objects))

    if options.get('logos') and getattr(response, "logo_annotations", None):
        logos = sorted(response.logo_annotations, key=lambda l: l.score, reverse=True)
        top_logos = [f"{logo.description} ({logo.score:.0%})" for logo in logos[:5]]
        parts.append("감지된 로고: " + ", ".join(top_logos))

    if options.get('text') and getattr(response, "text_annotations", None):
        text = response.text_annotations[0].description.strip()
        if text:
            preview = text.replace("\n", " ").strip()
            if len(preview) > 300:
                preview = preview[:300] + "..."
            parts.append(f"OCR 텍스트: {preview}")

    if options.get('safe_search') and getattr(response, "safe_search_annotation", None):
        safe = response.safe_search_annotation
        parts.append(
            "안전 필터: "
            f"성인 {safe.adult.name}, 폭력 {safe.violence.name}, 선정적 {safe.racy.name}"
        )

    if not parts:
        return "Vision API에서 유의미한 정보를 찾지 못했습니다."

    return "\n".join(parts)


def get_candidate_models(selected_model, available_models_clean):
    """사용할 Gemini 모델 후보 목록 생성"""
    model_names = []

    if selected_model and selected_model in available_models_clean:
        model_names.append(selected_model)

    if available_models_clean:
        preferred = [
            "gemini-2.5-pro-preview-03-25",
            "gemini-2.5-pro-preview",
            "gemini-1.5-flash",
            "gemini-1.5-pro",
            "gemini-pro",
        ]
        for name in preferred:
            if name in available_models_clean and name not in model_names:
                model_names.append(name)

        for candidate in available_models_clean:
            if candidate not in model_names and "gemini" in candidate.lower():
                model_names.append(candidate)

    if not model_names:
        model_names = ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-pro"]

    return model_names


def prepare_gemini_client():
    """Gemini API 클라이언트를 준비하고 사용할 모델 후보를 반환"""
    try:
        import google.generativeai as genai
    except ImportError:
        return None, None, [], "google-generativeai 패키지가 설치되지 않았습니다."

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return None, None, [], "GEMINI_API_KEY 환경 변수가 설정되지 않았습니다."

    genai.configure(api_key=api_key)
    selected_model = st.session_state.get('selected_gemini_model')

    try:
        available_models = [m.name for m in genai.list_models()
                            if 'generateContent' in m.supported_generation_methods]
        available_models_clean = [m.replace('models/', '') for m in available_models]
    except Exception:
        available_models_clean = []

    model_names = get_candidate_models(selected_model, available_models_clean)
    if not model_names:
        return None, None, [], "사용 가능한 모델을 찾을 수 없습니다."

    return genai, selected_model, available_models_clean, None


def analyze_with_gemini_image(image_content: bytes):
    """Gemini API에 이미지를 직접 전송하여 분석"""
    try:
        from PIL import Image
    except ImportError:
        return {
            'object': None,
            'brand': None,
            'company': None,
            'model': None,
            'error': 'pillow 패키지가 설치되지 않았습니다.'
        }

    genai, selected_model, available_models_clean, error_message = prepare_gemini_client()
    if error_message:
        return {
            'object': None,
            'brand': None,
            'company': None,
            'model': None,
            'error': error_message
        }

    model_names = get_candidate_models(selected_model, available_models_clean)

    prompt = f"""이 이미지를 분석하여 다음 JSON 형식으로 답변해주세요:

{GEMINI_JSON_GUIDE}

추가 지침:
- 이미지에서 가장 중심이 되는 물체를 우선적으로 판단하세요.
- 텍스트나 배경 요소는 보조 정보입니다.
- 브랜드를 확인하면 해당 브랜드를 소유/제조하는 실제 법인명(예: 롯데웰푸드, 애플코리아 등)을 정확히 기입하세요. 그룹명만 알 수 있을 경우, 법인을 확실히 찾을 때까지 추가 근거를 탐색하고 그래도 없으면 company는 null로 두세요.
- 상장된 회사라면 company_market에는 거래소(예: KRX, NASDAQ, NYSE 등), company_ticker에는 정확한 티커를 적으세요. 비상장이면 두 필드 모두 "비상장"으로 기입하고, 확실하지 않으면 null로 두세요.
- 추측하거나 부정확한 정보를 제공하지 마세요."""

    try:
        from PIL import Image
        image = Image.open(io.BytesIO(image_content))
    except Exception as exc:
        return {
            'object': None,
            'brand': None,
            'company': None,
            'model': None,
            'error': f'이미지 로드 오류: {str(exc)}'
        }

    last_error = None
    used_model = None
    response = None

    for model_name in model_names:
        try:
            model = genai.GenerativeModel(model_name)
            response = model.generate_content([prompt, image])
            used_model = model_name
            break
        except Exception as exc:
            last_error = str(exc)
            response = None

    if response is None:
        error_detail = f"사용 가능한 모델: {', '.join(available_models_clean) if available_models_clean else '없음'}"
        return {
            'object': None,
            'brand': None,
            'company': None,
            'model': used_model,
            'error': f'모든 모델 시도 실패: {last_error}. {error_detail}'
        }

    result, parse_error = extract_json_from_response_text(response.text.strip())
    if parse_error:
        return {
            'object': None,
            'brand': None,
            'company': None,
            'model': used_model,
            'error': parse_error
        }

    return {
        'object': result.get('object'),
        'brand': result.get('brand'),
        'company': result.get('company'),
        'company_market': result.get('company_market'),
        'company_ticker': result.get('company_ticker'),
        'model': used_model,
        'error': None
    }


def analyze_with_gemini_text(vision_summary: str):
    """Vision 분석 요약을 Gemini에 전달하여 object/brand/company 판단"""
    genai, selected_model, available_models_clean, error_message = prepare_gemini_client()
    if error_message:
        return {
            'object': None,
            'brand': None,
            'company': None,
            'model': None,
            'error': error_message
        }

    model_names = get_candidate_models(selected_model, available_models_clean)

    prompt = f"""다음 Google Cloud Vision 분석 결과를 기반으로 이미지 속 주요 물체와 그 브랜드(기업)를 판단하세요. 결과는 반드시 JSON으로만 응답해야 합니다.

Vision 분석 요약:
{vision_summary}

JSON 형식:
{GEMINI_JSON_GUIDE}

지침:
- Vision 라벨/객체 정보를 우선적으로 참고하되, 텍스트/로고 등 보조 정보도 고려하세요.
- 브랜드가 확인되면 그 브랜드를 실제로 제조하거나 판매하는 법인명을 정확히 기입하세요(예: 롯데자일리톨 → 롯데웰푸드). 그룹명만 알 수 있을 때는 추가 근거를 찾아보고, 끝까지 확실하지 않으면 company는 null로 두세요.
- company_market에는 상장 시장(예: KRX, NASDAQ 등), company_ticker에는 정확한 티커를 기입하세요. 비상장이면 두 필드 모두 "비상장"으로 작성하고, 확실하지 않으면 null로 두세요.
- 추측하거나 부정확한 정보를 제공하지 마세요."""

    last_error = None
    used_model = None
    response = None

    for model_name in model_names:
        try:
            model = genai.GenerativeModel(model_name)
            response = model.generate_content(prompt)
            used_model = model_name
            break
        except Exception as exc:
            last_error = str(exc)
            response = None

    if response is None:
        return {
            'object': None,
            'brand': None,
            'company': None,
            'model': used_model,
            'error': f'모든 모델 시도 실패: {last_error}'
        }

    result, parse_error = extract_json_from_response_text(response.text.strip())
    if parse_error:
        return {
            'object': None,
            'brand': None,
            'company': None,
            'model': used_model,
            'error': parse_error
        }

    return {
        'object': result.get('object'),
        'brand': result.get('brand'),
        'company': result.get('company'),
        'company_market': result.get('company_market'),
        'company_ticker': result.get('company_ticker'),
        'model': used_model,
        'error': None
    }


def render_gemini_result(gemini_result: dict):
    """Gemini 분석 결과를 UI로 표시"""
    if gemini_result.get('error'):
        st.warning(f"⚠️ {gemini_result['error']}")
        return

    used_model = gemini_result.get('model')
    if used_model:
        st.caption(f"🤖 사용된 모델: **{used_model}**")

    col_obj, col_brand, col_company = st.columns(3)

    obj = gemini_result.get('object')
    with col_obj:
        if obj and str(obj).lower() != 'null':
            st.metric("📦 물체", obj)
        else:
            st.metric("📦 물체", "감지되지 않음")

    brand = gemini_result.get('brand')
    with col_brand:
        if brand and str(brand).lower() != 'null':
            st.metric("🏷️ 브랜드", brand)
        else:
            st.metric("🏷️ 브랜드", "감지되지 않음")

    company = gemini_result.get('company')
    with col_company:
        if company and str(company).lower() != 'null':
            st.metric("🏢 소유 기업", company)
        else:
            st.metric("🏢 소유 기업", "감지되지 않음")

    col_market, col_ticker = st.columns(2)
    market = gemini_result.get('company_market')
    ticker = gemini_result.get('company_ticker')

    with col_market:
        if market and str(market).lower() != 'null':
            st.metric("📈 상장 시장", market)
        else:
            st.metric("📈 상장 시장", "감지되지 않음")

    with col_ticker:
        if ticker and str(ticker).lower() != 'null':
            st.metric("💹 티커", ticker)
        else:
            st.metric("💹 티커", "감지되지 않음")

    if obj and str(obj).lower() != 'null' and brand and str(brand).lower() != 'null' and company and str(company).lower() != 'null':
        st.success(f"💡 **결론**: 이것은 **{company}** 소속 브랜드 **{brand}**의 **{obj}**입니다.")
    elif obj and str(obj).lower() != 'null' and brand and str(brand).lower() != 'null':
        st.info(f"💡 **결론**: 이것은 **{brand}**의 **{obj}**입니다.")
    elif obj and str(obj).lower() != 'null':
        st.info(f"💡 **결론**: 이것은 **{obj}**입니다.")
    elif brand and str(brand).lower() != 'null':
        st.info(f"💡 **결론**: **{brand}** 브랜드가 감지되었습니다.")


# --------------------------- Streamlit UI ---------------------------

st.set_page_config(page_title="Google Cloud Vision 이미지 인식", page_icon="📸", layout="wide")

st.title("📸 Google Cloud Vision 이미지 인식")
st.markdown("이미지를 업로드하여 자동으로 정보를 인식하고 분석합니다.")

with st.sidebar:
    st.header("⚙️ 설정")

    credentials_path = st.text_input(
        "서비스 계정 키 파일 경로",
        value=os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "my-project-41019-475914-bd9a8d61852f.json"),
        help="Google Cloud 서비스 계정 키 JSON 파일 경로"
    )
    if credentials_path:
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = credentials_path

    gemini_key = st.text_input(
        "Gemini API 키",
        value=os.getenv("GEMINI_API_KEY", ""),
        type="password",
        help="Google Gemini API 키"
    )
    if gemini_key:
        os.environ["GEMINI_API_KEY"] = gemini_key

    st.markdown("---")
    st.markdown("### 🤖 Gemini 모델 선택")

    available_models_clean = []
    if gemini_key:
        try:
            import google.generativeai as genai
            genai.configure(api_key=gemini_key)
            available_models = [m.name.replace('models/', '') for m in genai.list_models()
                                if 'generateContent' in m.supported_generation_methods and 'gemini' in m.name.lower()]
            flash_models = [m for m in available_models if 'flash' in m.lower()]
            pro_models = [m for m in available_models if 'pro' in m.lower() and 'flash' not in m.lower()]
            other_models = [m for m in available_models if m not in flash_models and m not in pro_models]
            available_models_clean = flash_models + pro_models + other_models

            if available_models_clean:
                selected_model = st.selectbox(
                    "사용할 모델 선택",
                    options=available_models_clean,
                    index=0,
                    help="사용할 Gemini 모델을 선택하세요. Flash 모델은 빠르고, Pro 모델은 더 정확합니다."
                )
                st.session_state['selected_gemini_model'] = selected_model
            else:
                st.warning("⚠️ 사용 가능한 모델을 찾을 수 없습니다.")
                st.session_state['selected_gemini_model'] = None
        except Exception as exc:
            st.warning(f"⚠️ 모델 목록을 가져올 수 없습니다: {str(exc)}")
            st.session_state['selected_gemini_model'] = None
    else:
        st.info("💡 Gemini API 키를 입력하면 사용 가능한 모델 목록을 확인할 수 있습니다.")
        st.session_state['selected_gemini_model'] = None

    st.markdown("---")
    st.markdown("### 🔀 분석 모드")
    if "analysis_mode" not in st.session_state:
        st.session_state.analysis_mode = "Google Vision + Gemini 텍스트 분석"

    analysis_mode = st.radio(
        "사용할 분석 방식을 선택하세요.",
        options=(
            "Google Vision 결과만 보기",
            "Google Vision + Gemini 텍스트 분석",
            "Gemini 직접 이미지 분석"
        ),
        key="analysis_mode"
    )

    enable_vision = analysis_mode != "Gemini 직접 이미지 분석"

    st.markdown("---")
    st.markdown("### 📋 Google Vision 분석 옵션")
    if not enable_vision:
        st.info("현재 모드에서는 Google Vision 옵션이 사용되지 않습니다.")

    analyze_labels = st.checkbox("라벨 분석", value=True, disabled=not enable_vision, key="opt_labels")
    analyze_text = st.checkbox("텍스트 추출 (OCR)", value=True, disabled=not enable_vision, key="opt_text")
    analyze_objects = st.checkbox("객체 감지", value=True, disabled=not enable_vision, key="opt_objects")
    analyze_faces = st.checkbox("얼굴 감지", value=False, disabled=not enable_vision, key="opt_faces")
    analyze_landmarks = st.checkbox("랜드마크 인식", value=False, disabled=not enable_vision, key="opt_landmarks")
    analyze_logos = st.checkbox("로고 인식", value=True, disabled=not enable_vision, key="opt_logos")
    analyze_safe_search = st.checkbox("안전 필터링", value=False, disabled=not enable_vision, key="opt_safe")

    if not enable_vision:
        analyze_labels = analyze_text = analyze_objects = analyze_faces = analyze_landmarks = analyze_logos = analyze_safe_search = False


client = init_vision_client()
analysis_mode = st.session_state.get('analysis_mode', "Google Vision + Gemini 텍스트 분석")

if client is None:
    st.warning("⚠️ Google Cloud Vision 클라이언트를 초기화할 수 없습니다. 서비스 계정 키 파일을 확인해주세요.")
else:
    uploaded_file = st.file_uploader(
        "이미지 파일을 선택하세요",
        type=['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'],
        help="지원 형식: PNG, JPG, JPEG, GIF, BMP, WebP"
    )

    if uploaded_file is not None:
        col1, col2 = st.columns([1, 1])

        with col1:
            st.subheader("📷 업로드된 이미지")
            st.image(uploaded_file, use_container_width=True)
            st.caption(f"파일명: {uploaded_file.name}")
            st.caption(f"크기: {uploaded_file.size:,} bytes")

        with col2:
            st.subheader("🔍 분석 결과")

            options = {
                'labels': analyze_labels,
                'text': analyze_text,
                'objects': analyze_objects,
                'faces': analyze_faces,
                'landmarks': analyze_landmarks,
                'logos': analyze_logos,
                'safe_search': analyze_safe_search
            }

            button_labels = {
                "Google Vision 결과만 보기": "🚀 Vision 분석 실행",
                "Google Vision + Gemini 텍스트 분석": "🚀 Vision + Gemini 분석 실행",
                "Gemini 직접 이미지 분석": "🚀 Gemini 이미지 분석 실행"
            }
            button_label = button_labels.get(analysis_mode, "🚀 분석 실행")

            if st.button(button_label, type="primary", use_container_width=True):
                try:
                    image_content = uploaded_file.getvalue()

                    if analysis_mode == "Gemini 직접 이미지 분석":
                        st.markdown("### 🤖 Gemini AI 분석")
                        with st.spinner("🤖 Gemini AI가 이미지를 분석하는 중..."):
                            gemini_result = analyze_with_gemini_image(image_content)
                        render_gemini_result(gemini_result)

                    else:
                        if not any(options.values()):
                            st.warning("분석할 항목을 하나 이상 선택해주세요.")
                        else:
                            with st.spinner("🔎 Google Vision이 이미지를 분석하는 중..."):
                                vision_response = analyze_image(client, image_content, options)

                            if vision_response is None:
                                st.warning("분석할 항목을 선택해주세요.")
                            else:
                                st.success("✅ Google Vision 분석 완료!")
                                st.markdown("---")
                                st.markdown("### 📊 Google Vision 분석 결과")

                                if analyze_labels and getattr(vision_response, "label_annotations", None):
                                    with st.expander("🏷️ 라벨", expanded=True):
                                        for label in vision_response.label_annotations[:10]:
                                            st.progress(label.score, text=f"{label.description} ({label.score:.1%})")

                                if analyze_text and getattr(vision_response, "text_annotations", None):
                                    with st.expander("📝 추출된 텍스트", expanded=True):
                                        full_text = vision_response.text_annotations[0].description
                                        st.text_area("텍스트", full_text, height=200, label_visibility="collapsed")

                                        if len(vision_response.text_annotations) > 1:
                                            st.markdown("**단어별 인식:**")
                                            words = [ann.description for ann in vision_response.text_annotations[1:11]]
                                            st.write(", ".join(words))

                                if analyze_objects and getattr(vision_response, "localized_object_annotations", None):
                                    with st.expander("🎯 감지된 객체", expanded=True):
                                        for obj in vision_response.localized_object_annotations:
                                            st.write(f"**{obj.name}** (신뢰도: {obj.score:.1%})")

                                if analyze_faces and getattr(vision_response, "face_annotations", None):
                                    with st.expander("😊 얼굴 감지", expanded=True):
                                        st.write(f"**{len(vision_response.face_annotations)}개의 얼굴이 감지되었습니다.**")
                                        for idx, face in enumerate(vision_response.face_annotations, 1):
                                            st.markdown(f"##### 얼굴 {idx}")
                                            col_a, col_b = st.columns(2)
                                            with col_a:
                                                st.write(f"기쁨: {face.joy_likelihood.name}")
                                                st.write(f"슬픔: {face.sorrow_likelihood.name}")
                                            with col_b:
                                                st.write(f"분노: {face.anger_likelihood.name}")
                                                st.write(f"놀람: {face.surprise_likelihood.name}")
                                            st.write(f"감지 신뢰도: {face.detection_confidence:.1%}")

                                if analyze_landmarks and getattr(vision_response, "landmark_annotations", None):
                                    with st.expander("🗺️ 랜드마크", expanded=True):
                                        for landmark in vision_response.landmark_annotations:
                                            st.write(f"**{landmark.description}**")

                                if analyze_logos and getattr(vision_response, "logo_annotations", None):
                                    with st.expander("🏢 로고", expanded=True):
                                        for logo in vision_response.logo_annotations:
                                            st.write(f"**{logo.description}** (신뢰도: {logo.score:.1%})")

                                if analyze_safe_search and getattr(vision_response, "safe_search_annotation", None):
                                    with st.expander("🛡️ 안전 필터", expanded=True):
                                        safe = vision_response.safe_search_annotation
                                        col1, col2, col3 = st.columns(3)
                                        with col1:
                                            st.metric("성인 콘텐츠", safe.adult.name)
                                        with col2:
                                            st.metric("폭력", safe.violence.name)
                                        with col3:
                                            st.metric("선정적", safe.racy.name)

                                if analysis_mode == "Google Vision + Gemini 텍스트 분석":
                                    summary = summarize_vision_response(vision_response, options)
                                    st.markdown("---")
                                    st.markdown("### 🤖 Gemini AI 분석")

                                    with st.spinner("🤖 Gemini AI가 Vision 결과를 해석하는 중..."):
                                        gemini_result = analyze_with_gemini_text(summary)

                                    render_gemini_result({
                                        'object': gemini_result.get('object'),
                                        'brand': gemini_result.get('brand'),
                                        'company': gemini_result.get('company'),
                                        'company_market': gemini_result.get('company_market'),
                                        'company_ticker': gemini_result.get('company_ticker'),
                                        'model': gemini_result.get('model'),
                                        'error': gemini_result.get('error')
                                    })

                except Exception as exc:
                    st.error(f"❌ 분석 중 오류 발생: {str(exc)}")
                    st.exception(exc)

    else:
        st.info("👆 위에서 이미지 파일을 선택하거나 드래그하여 업로드하세요.")
        with st.expander("💡 사용 방법"):
            st.markdown(
                """
                1. **이미지 선택**: 파일 탐색기에서 이미지 파일을 선택하거나 드래그 앤 드롭
                2. **분석 옵션 선택**: 왼쪽 사이드바에서 원하는 분석 항목 선택
                3. **분석 시작**: "분석 실행" 버튼 클릭
                4. **결과 확인**: 분석 결과가 오른쪽에 표시됩니다

                **지원 기능:**
                - 🏷️ 라벨 분석: 이미지의 내용을 자동으로 태그
                - 📝 텍스트 추출: 이미지에서 텍스트 인식 (OCR)
                - 🎯 객체 감지: 이미지 내 객체 위치 및 종류
                - 😊 얼굴 감지: 얼굴 감지 및 감정 분석
                - 🗺️ 랜드마크: 유명 랜드마크 인식
                - 🏢 로고: 브랜드 로고 인식
                - 🛡️ 안전 필터: 성인 콘텐츠, 폭력 등 검사
                """
            )

st.markdown("---")
st.caption("Powered by Google Cloud Vision API & Gemini")
