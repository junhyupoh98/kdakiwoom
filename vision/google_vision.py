"""
Google Cloud Vision API를 사용하여 이미지에서 정보를 인식하는 스크립트
- 이미지 분석 (라벨, 텍스트, 얼굴, 랜드마크 등)
- OCR (텍스트 추출)
- 객체 감지
- 안전 필터링
"""

import os
from dotenv import load_dotenv
from google.cloud import vision
from google.cloud.vision_v1 import types

# 환경 변수 로드
load_dotenv()

class GoogleVisionAnalyzer:
    def __init__(self):
        """Google Cloud Vision 클라이언트 초기화"""
        # 서비스 계정 키 파일 경로 확인
        credentials_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
        
        if credentials_path:
            # 상대 경로를 절대 경로로 변환 (현재 파일 기준이 아닌 프로젝트 루트 기준)
            if not os.path.isabs(credentials_path):
                # 현재 파일의 루트 디렉토리 찾기 (vision 폴더의 상위)
                current_dir = os.path.dirname(os.path.abspath(__file__))
                root_dir = os.path.dirname(current_dir)  # vision의 상위 = 프로젝트 루트
                credentials_path = os.path.join(root_dir, credentials_path)
            
            # 경로 정규화 (백슬래시/슬래시 통일)
            credentials_path = os.path.normpath(credentials_path)
            os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = credentials_path
            
            # 파일 존재 확인
            if not os.path.exists(credentials_path):
                raise FileNotFoundError(
                    f"서비스 계정 키 파일을 찾을 수 없습니다: {credentials_path}\n"
                    f"파일 경로를 확인해주세요.\n"
                    f"현재 작업 디렉토리: {os.getcwd()}"
                )
        
        try:
            self.client = vision.ImageAnnotatorClient()
            print(f"✅ Google Cloud Vision 클라이언트 초기화 완료 (인증 파일: {credentials_path})")
        except Exception as e:
            raise ValueError(
                f"Google Cloud Vision 클라이언트 초기화 실패: {str(e)}\n"
                "서비스 계정 키 파일을 설정해주세요:\n"
                "1. .env 파일에 GOOGLE_APPLICATION_CREDENTIALS=파일명.json 설정\n"
                "2. 또는 환경 변수로 설정"
            )
    
    def load_image(self, image_path):
        """이미지 파일을 읽어서 Vision API 형식으로 변환"""
        with open(image_path, 'rb') as image_file:
            content = image_file.read()
        return types.Image(content=content)
    
    def analyze_image(self, image_path):
        """
        이미지를 분석하여 라벨, 텍스트, 얼굴 등을 추출
        
        Args:
            image_path: 분석할 이미지 파일 경로
            
        Returns:
            분석 결과 딕셔너리
        """
        print(f"\n📸 이미지 분석 중: {image_path}")
        
        image = self.load_image(image_path)
        
        # 다양한 기능 수행
        from google.cloud.vision_v1 import types as vision_types
        
        features = [
            {'type_': vision_types.Feature.Type.LABEL_DETECTION},
            {'type_': vision_types.Feature.Type.TEXT_DETECTION},
            {'type_': vision_types.Feature.Type.FACE_DETECTION},
            {'type_': vision_types.Feature.Type.LANDMARK_DETECTION},
            {'type_': vision_types.Feature.Type.LOGO_DETECTION},
            {'type_': vision_types.Feature.Type.OBJECT_LOCALIZATION},
            {'type_': vision_types.Feature.Type.SAFE_SEARCH_DETECTION},
        ]
        
        response = self.client.annotate_image({
            'image': image,
            'features': features
        })
        
        result = {
            'labels': [(label.description, label.score) for label in response.label_annotations],
            'text': response.text_annotations[0].description if response.text_annotations else "",
            'faces': len(response.face_annotations),
            'landmarks': [landmark.description for landmark in response.landmark_annotations],
            'logos': [logo.description for logo in response.logo_annotations],
            'objects': [(obj.name, obj.score) for obj in response.localized_object_annotations],
            'safe_search': {
                'adult': response.safe_search_annotation.adult.name,
                'violence': response.safe_search_annotation.violence.name,
                'racy': response.safe_search_annotation.racy.name,
            }
        }
        
        return result
    
    def extract_text(self, image_path):
        """
        이미지에서 텍스트 추출 (OCR)
        
        Args:
            image_path: 텍스트를 추출할 이미지 파일 경로
            
        Returns:
            추출된 텍스트 문자열
        """
        print(f"\n📝 텍스트 추출 중: {image_path}")
        
        image = self.load_image(image_path)
        response = self.client.text_detection(image=image)
        
        if response.text_annotations:
            return response.text_annotations[0].description
        return ""
    
    def detect_objects(self, image_path):
        """
        이미지에서 객체 감지
        
        Args:
            image_path: 분석할 이미지 파일 경로
            
        Returns:
            감지된 객체 리스트
        """
        print(f"\n🔍 객체 감지 중: {image_path}")
        
        image = self.load_image(image_path)
        response = self.client.object_localization(image=image)
        
        objects = []
        for obj in response.localized_object_annotations:
            # 바운딩 박스 정보 추출
            vertices = []
            for vertex in obj.bounding_poly.normalized_vertices:
                vertices.append({
                    'x': vertex.x,
                    'y': vertex.y
                })
            
            objects.append({
                'name': obj.name,
                'score': obj.score,
                'vertices': vertices
            })
        
        return objects
    
    def detect_faces(self, image_path):
        """
        이미지에서 얼굴 감지
        
        Args:
            image_path: 분석할 이미지 파일 경로
            
        Returns:
            감지된 얼굴 정보 리스트
        """
        print(f"\n😊 얼굴 감지 중: {image_path}")
        
        image = self.load_image(image_path)
        response = self.client.face_detection(image=image)
        
        faces = []
        for face in response.face_annotations:
            faces.append({
                'joy_likelihood': face.joy_likelihood.name,
                'sorrow_likelihood': face.sorrow_likelihood.name,
                'anger_likelihood': face.anger_likelihood.name,
                'surprise_likelihood': face.surprise_likelihood.name,
                'detection_confidence': face.detection_confidence,
            })
        
        return faces
    
    def print_analysis_results(self, results):
        """분석 결과를 보기 좋게 출력"""
        print("\n" + "="*50)
        print("📊 이미지 분석 결과")
        print("="*50)
        
        if results['labels']:
            print("\n🏷️  라벨:")
            for label, score in results['labels'][:10]:  # 상위 10개만
                print(f"   • {label} ({score:.2%})")
        
        if results['text']:
            print(f"\n📝 감지된 텍스트:")
            print(f"   {results['text'][:200]}...")  # 처음 200자만
        
        if results['faces'] > 0:
            print(f"\n😊 얼굴: {results['faces']}개 감지")
        
        if results['landmarks']:
            print(f"\n🗺️  랜드마크: {', '.join(results['landmarks'])}")
        
        if results['logos']:
            print(f"\n🏢 로고: {', '.join(results['logos'])}")
        
        if results['objects']:
            print(f"\n🎯 객체:")
            for obj_name, score in results['objects']:
                print(f"   • {obj_name} ({score:.2%})")
        
        print(f"\n🛡️  안전 필터:")
        print(f"   성인 콘텐츠: {results['safe_search']['adult']}")
        print(f"   폭력: {results['safe_search']['violence']}")
        print(f"   선정적: {results['safe_search']['racy']}")
        
        print("="*50)
    
    def print_text_results(self, text):
        """추출된 텍스트를 보기 좋게 출력"""
        print("\n" + "="*50)
        print("📝 추출된 텍스트")
        print("="*50)
        if text:
            print(text)
        else:
            print("텍스트를 찾을 수 없습니다.")
        print("="*50)
    
    def print_objects_results(self, objects):
        """감지된 객체를 보기 좋게 출력"""
        print("\n" + "="*50)
        print("🔍 감지된 객체")
        print("="*50)
        if objects:
            for obj in objects:
                print(f"\n  • {obj['name']}")
                print(f"    신뢰도: {obj['score']:.2%}")
        else:
            print("감지된 객체가 없습니다.")
        print("="*50)
    
    def print_faces_results(self, faces):
        """감지된 얼굴을 보기 좋게 출력"""
        print("\n" + "="*50)
        print("😊 감지된 얼굴")
        print("="*50)
        if faces:
            for i, face in enumerate(faces, 1):
                print(f"\n  얼굴 {i}:")
                print(f"    기쁨: {face['joy_likelihood']}")
                print(f"    슬픔: {face['sorrow_likelihood']}")
                print(f"    분노: {face['anger_likelihood']}")
                print(f"    놀람: {face['surprise_likelihood']}")
                print(f"    감지 신뢰도: {face['detection_confidence']:.2%}")
        else:
            print("감지된 얼굴이 없습니다.")
        print("="*50)


def main():
    """메인 함수"""
    try:
        analyzer = GoogleVisionAnalyzer()
        
        # 이미지 경로 입력 받기
        image_path = input("분석할 이미지 파일 경로를 입력하세요: ").strip()
        
        if not os.path.exists(image_path):
            print(f"❌ 파일을 찾을 수 없습니다: {image_path}")
            return
        
        print("\n어떤 분석을 수행하시겠습니까?")
        print("1. 전체 분석 (라벨, 텍스트, 객체, 얼굴 등)")
        print("2. 텍스트 추출 (OCR)")
        print("3. 객체 감지")
        print("4. 얼굴 감지")
        print("5. 모든 분석 수행")
        
        choice = input("\n선택 (1-5): ").strip()
        
        if choice == "1":
            results = analyzer.analyze_image(image_path)
            analyzer.print_analysis_results(results)
        
        elif choice == "2":
            text = analyzer.extract_text(image_path)
            analyzer.print_text_results(text)
        
        elif choice == "3":
            objects = analyzer.detect_objects(image_path)
            analyzer.print_objects_results(objects)
        
        elif choice == "4":
            faces = analyzer.detect_faces(image_path)
            analyzer.print_faces_results(faces)
        
        elif choice == "5":
            # 전체 분석
            results = analyzer.analyze_image(image_path)
            analyzer.print_analysis_results(results)
            
            text = analyzer.extract_text(image_path)
            analyzer.print_text_results(text)
            
            objects = analyzer.detect_objects(image_path)
            analyzer.print_objects_results(objects)
            
            faces = analyzer.detect_faces(image_path)
            analyzer.print_faces_results(faces)
        
        else:
            print("❌ 잘못된 선택입니다.")
    
    except Exception as e:
        print(f"❌ 오류 발생: {str(e)}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()

