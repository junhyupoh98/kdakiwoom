import json
import os
import re
from typing import Any, Dict, Iterable, List, Optional, Tuple

import chromadb
from chromadb.api import ClientAPI
from chromadb.api.models.Collection import Collection

CHROMADB_API_KEY = os.getenv(
    "CHROMADB_API_KEY",
    "ck-BGYLZPX4So3TCKT9MLwvDB3GSdbGJzgv4eM4Lpca9f8s",
)
CHROMADB_TENANT = os.getenv(
    "CHROMADB_TENANT",
    "2f8c70eb-2e37-4645-bdf7-676a3324e684",
)
CHROMADB_DATABASE = os.getenv(
    "CHROMADB_DATABASE",
    "project_pic",
)
US_NEWS_COLLECTION = os.getenv(
    "CHROMADB_US_NEWS_COLLECTION",
    "USnews_summary_ko",
)

US_FIN_COLLECTION = os.getenv("CHROMADB_US_FIN_COLLECTION", "USfund_charts")
KR_FIN_COLLECTION = os.getenv("CHROMADB_KR_FIN_COLLECTION", "KRfund_financials")

_client: Optional[ClientAPI] = None
_us_news_collection: Optional[Collection] = None
_us_fin_collection: Optional[Collection] = None
_kr_fin_collection: Optional[Collection] = None


def get_chroma_client() -> ClientAPI:
    """지연 초기화된 Chroma CloudClient 반환"""
    global _client
    if _client is None:
        if not CHROMADB_API_KEY:
            raise RuntimeError("CHROMADB_API_KEY 환경 변수가 설정되어 있지 않습니다.")
        if not CHROMADB_TENANT:
            raise RuntimeError("CHROMADB_TENANT 환경 변수가 설정되어 있지 않습니다.")
        if not CHROMADB_DATABASE:
            raise RuntimeError("CHROMADB_DATABASE 환경 변수가 설정되어 있지 않습니다.")

        _client = chromadb.CloudClient(
            api_key=CHROMADB_API_KEY,
            tenant=CHROMADB_TENANT,
            database=CHROMADB_DATABASE,
        )

    return _client


def get_us_news_collection() -> Collection:
    """미국 주식 뉴스 요약이 저장된 컬렉션 핸들 반환"""
    global _us_news_collection
    if _us_news_collection is None:
        client = get_chroma_client()
        _us_news_collection = client.get_collection(US_NEWS_COLLECTION)
    return _us_news_collection


def get_us_fin_collection() -> Collection:
    """미국 주식 재무 데이터가 저장된 컬렉션 핸들 반환"""
    global _us_fin_collection
    if _us_fin_collection is None:
        client = get_chroma_client()
        _us_fin_collection = client.get_collection(US_FIN_COLLECTION)
    return _us_fin_collection


def get_kr_fin_collection() -> Collection:
    """한국 주식 재무 데이터가 저장된 컬렉션 핸들 반환"""
    global _kr_fin_collection
    if _kr_fin_collection is None:
        client = get_chroma_client()
        _kr_fin_collection = client.get_collection(KR_FIN_COLLECTION)
    return _kr_fin_collection

def _parse_date_for_sort(metadata: Dict[str, Any]) -> Any:
    """정렬용 날짜 키 추출 (date_int > published_at > date)"""
    if "date_int" in metadata:
        return metadata["date_int"]
    if "published_at" in metadata:
        return metadata["published_at"]
    if "date" in metadata:
        return metadata["date"]
    return ""


def fetch_us_stock_news(symbol: str, limit: int = 3) -> List[Dict[str, Any]]:
    """
    종목별 미국 주식 뉴스 요약 리스트 반환.

    Args:
        symbol: 조회할 티커(예: TSLA, AAPL). 대소문자 무관.
        limit: 최대 반환 개수.

    Returns:
        title/summary/url 등의 정보를 담은 dict 리스트.
    """
    if not symbol:
        return []

    collection = get_us_news_collection()
    where_filter = {"ticker": symbol.upper()}

    # 충분한 개수를 가져와 날짜 기준으로 최신순 정렬
    fetch_limit = max(limit * 3, limit)
    result = collection.get(where=where_filter, limit=fetch_limit)
    documents = result.get("documents") or []
    metadatas = result.get("metadatas") or []

    print("[DEBUG] Chroma financial documents sample:", documents[:1])
    print("[DEBUG] Chroma financial metadatas sample:", metadatas[:1])
    ids = result.get("ids") or []

    news_items: List[Dict[str, Any]] = []
    for idx, doc in enumerate(documents):
        metadata = metadatas[idx] if idx < len(metadatas) else {}
        news_items.append(
            {
                "id": ids[idx] if idx < len(ids) else None,
                "ticker": metadata.get("ticker") or metadata.get("fmp_ticker"),
                "title": metadata.get("title"),
                "summary": doc,
                "url": metadata.get("url"),
                "published_at": metadata.get("published_at") or metadata.get("date"),
                "source": metadata.get("source") or metadata.get("site"),
                "date_int": metadata.get("date_int"),
                "raw_metadata": metadata,
            }
        )

    news_items.sort(
        key=lambda item: (
            item.get("date_int"),
            item.get("published_at"),
            item.get("raw_metadata", {}).get("date"),
        ),
        reverse=True,
    )

    return news_items[:limit]


def _parse_numeric(value: Any) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    try:
        stripped = str(value).replace(",", "").strip()
        if stripped == "":
            return None
        return float(stripped)
    except (ValueError, TypeError):
        return None


def _extract_row_value(row: Dict[str, Any], candidates: Iterable[str]) -> Optional[float]:
    lowered = {str(k).lower(): v for k, v in row.items()}
    for candidate in candidates:
        key = candidate.lower()
        if key in lowered:
            parsed = _parse_numeric(lowered[key])
            if parsed is not None:
                return parsed
    return None


def _extract_year(row: Dict[str, Any]) -> Optional[str]:
    candidates = ["year", "period", "label", "date", "fiscal_year"]
    for candidate in candidates:
        value = row.get(candidate) or row.get(candidate.upper()) or row.get(candidate.capitalize())
        if value:
            text = str(value).strip()
            if len(text) >= 4:
                # 연도만 추출
                return text[:10]
    return None


def _normalize_financial_rows(rows: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    processed: List[Tuple[str, Dict[str, float]]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        year = _extract_year(row)
        if not year:
            continue
        revenue = _extract_row_value(row, ["revenue", "sales", "total_revenue"])
        operating_income = _extract_row_value(row, ["operatingincome", "operating_income", "ebit"])
        net_income = _extract_row_value(row, ["netincome", "net_income", "profit"])

        if revenue is None and operating_income is None and net_income is None:
            continue

        processed.append(
            (
                year,
                {
                    "revenue": revenue,
                    "operatingIncome": operating_income,
                    "netIncome": net_income,
                },
            )
        )

    if not processed:
        return None

    processed.sort(key=lambda item: item[0])
    chart_data = []
    revenue_series = []
    net_income_series = []
    operating_income_series = []

    for year, metrics in processed:
        revenue = metrics.get("revenue") or 0.0
        operating_income = metrics.get("operatingIncome") or 0.0
        net_income = metrics.get("netIncome") or 0.0

        chart_data.append(
            {
                "year": year,
                "revenue": revenue,
                "operatingIncome": operating_income,
                "netIncome": net_income,
            }
        )
        revenue_series.append({"year": year, "value": revenue})
        net_income_series.append({"year": year, "value": net_income})
        operating_income_series.append({"year": year, "value": operating_income})

    latest_entry = chart_data[-1]

    return {
        "chartData": chart_data,
        "revenue": revenue_series,
        "netIncome": net_income_series,
        "operatingIncome": operating_income_series,
        "latest": {
            "year": latest_entry.get("year"),
            "revenue": latest_entry.get("revenue", 0.0),
            "operatingIncome": latest_entry.get("operatingIncome", 0.0),
            "netIncome": latest_entry.get("netIncome", 0.0),
        },
    }


def _parse_financial_document(document: Any) -> Optional[Dict[str, Any]]:
    payload: Any = document
    if isinstance(document, str):
        try:
            payload = json.loads(document)
        except json.JSONDecodeError:
            return None

    if isinstance(payload, dict):
        if isinstance(payload.get("rows"), list):
            return _normalize_financial_rows(payload["rows"])
        if isinstance(payload.get("data"), list):
            return _normalize_financial_rows(payload["data"])
        if isinstance(payload.get("series"), list):
            # series 형태를 rows로 변환 (각 시리즈가 동일한 길이를 가진다고 가정)
            rows_map: Dict[int, Dict[str, Any]] = {}
            for series in payload["series"]:
                name = series.get("name") or series.get("label")
                values = series.get("values") or series.get("data")
                if not name or not isinstance(values, list):
                    continue
                for idx, value in enumerate(values):
                    rows_map.setdefault(idx, {})
                    rows_map[idx][name] = value
            rows = list(rows_map.values())
            return _normalize_financial_rows(rows)
    elif isinstance(payload, list):
        return _normalize_financial_rows(payload)

    return None


def fetch_us_financials_from_chroma(symbol: str) -> Optional[Dict[str, Any]]:
    """
    미국 주식 재무 데이터를 Chroma에서 조회하여 프론트에서 사용하는 형식으로 변환
    """
    if not symbol:
        return None

    print("[DEBUG] Chroma fetch start:", symbol)

    try:
        collection = get_us_fin_collection()
    except Exception as exc:
        print("[DEBUG] Chroma client init error:", exc)
        return None

    try:
        result = collection.get(
            where={"symbol": symbol.upper()},
            limit=5,
            include=["metadatas", "documents"],
        )
        print("[DEBUG] Chroma raw result:", result)
    except Exception as exc:
        print("[DEBUG] Chroma get() error:", exc)
        return None

    documents = result.get("documents") or []
    metadatas = result.get("metadatas") or []

    print("[DEBUG] Chroma financial documents sample:", documents[:1])
    print("[DEBUG] Chroma financial metadatas sample:", metadatas[:1])

    quarter_doc = None
    quarter_meta = None
    annual_doc = None
    annual_meta = None
    segment_meta = None

    for idx, document in enumerate(documents):
        metadata = metadatas[idx] if idx < len(metadatas) else {}
        kind = (metadata or {}).get("kind")
        if kind == "qbars_quarter":
            quarter_doc = document
            quarter_meta = metadata or {}
        elif kind == "ybars_annual":
            annual_doc = document
            annual_meta = metadata or {}
        elif kind == "seg_q":
            segment_meta = metadata or {}

    if not quarter_doc and not annual_doc:
        print("[DEBUG] Chroma financial docs missing:", symbol)
        return None

    def parse_values(text: str, suffix: str) -> Dict[str, float]:
        patterns = {
            "revenue": rf"매출\s([\d\.,]+){suffix}",
            "operatingIncome": rf"영업(?:이익)?\s([\d\.,]+){suffix}",
            "netIncome": rf"순(?:이익)?\s([\d\.,]+){suffix}",
        }
        values: Dict[str, float] = {}
        for key, pattern in patterns.items():
            match = re.search(pattern, text)
            if match:
                raw = match.group(1).replace(",", "")
                try:
                    values[key] = float(raw)
                except ValueError:
                    values[key] = 0.0
            else:
                values[key] = 0.0
        return values

    def in_billions_to_amount(values: Dict[str, float]) -> Dict[str, float]:
        return {k: v * 1_000_000_000.0 for k, v in values.items()}

    chart_rows: List[Dict[str, Any]] = []
    revenue_series: List[Dict[str, Any]] = []
    net_income_series: List[Dict[str, Any]] = []
    operating_series: List[Dict[str, Any]] = []
    latest_entry: Dict[str, Any] = {}

    if quarter_doc:
        quarter_vals = in_billions_to_amount(parse_values(str(quarter_doc), "B"))
        as_of = (quarter_meta or {}).get("as_of") or (quarter_meta or {}).get("date") or "Recent Quarter"
        row = {
            "year": as_of,
            "revenue": quarter_vals.get("revenue", 0.0),
            "operatingIncome": quarter_vals.get("operatingIncome", 0.0),
            "netIncome": quarter_vals.get("netIncome", 0.0),
        }
        chart_rows.append(row)
        revenue_series.append({"year": as_of, "value": row["revenue"]})
        net_income_series.append({"year": as_of, "value": row["netIncome"]})
        operating_series.append({"year": as_of, "value": row["operatingIncome"]})
        latest_entry = row

    if annual_doc:
        annual_vals = in_billions_to_amount(parse_values(str(annual_doc), "B"))
        as_of = (annual_meta or {}).get("as_of") or (annual_meta or {}).get("date") or "Recent Year"
        row = {
            "year": as_of,
            "revenue": annual_vals.get("revenue", 0.0),
            "operatingIncome": annual_vals.get("operatingIncome", 0.0),
            "netIncome": annual_vals.get("netIncome", 0.0),
        }
        chart_rows.append(row)
        revenue_series.append({"year": as_of, "value": row["revenue"]})
        net_income_series.append({"year": as_of, "value": row["netIncome"]})
        operating_series.append({"year": as_of, "value": row["operatingIncome"]})
        if not latest_entry:
            latest_entry = row

    chart_rows.sort(key=lambda item: item["year"])
    revenue_series.sort(key=lambda item: item["year"])
    net_income_series.sort(key=lambda item: item["year"])
    operating_series.sort(key=lambda item: item["year"])

    response: Dict[str, Any] = {
        "revenue": revenue_series,
        "netIncome": net_income_series,
        "operatingIncome": operating_series,
        "chartData": chart_rows,
        "latest": {
            "year": latest_entry.get("year", ""),
            "revenue": latest_entry.get("revenue", 0.0),
            "operatingIncome": latest_entry.get("operatingIncome", 0.0),
            "netIncome": latest_entry.get("netIncome", 0.0),
        },
    }

    currency = (quarter_meta or {}).get("currency") or (annual_meta or {}).get("currency")
    if currency:
        response["currency"] = currency
    as_of = (quarter_meta or {}).get("as_of") or (annual_meta or {}).get("as_of")
    if as_of:
        response["asOf"] = as_of

    source_meta = quarter_meta or annual_meta or {}
    if source_meta:
        response["source"] = {
            "collection": US_FIN_COLLECTION,
            "doc_id": source_meta.get("doc_id"),
        }

    if segment_meta and segment_meta.get("segments"):
        try:
            raw_segments = json.loads(segment_meta["segments"])
        except json.JSONDecodeError:
            raw_segments = None
        if isinstance(raw_segments, dict):
            total = sum(float(v) for v in raw_segments.values() if isinstance(v, (int, float)))
            segments_list = []
            for name, value in raw_segments.items():
                try:
                    amount = float(value)
                except (TypeError, ValueError):
                    continue
                percentage = (amount / total * 100.0) if total else 0.0
                segments_list.append(
                    {
                        "segment": name,
                        "revenue": amount,
                        "percentage": percentage,
                    }
                )
            segments_list.sort(key=lambda item: item["revenue"], reverse=True)
            response["segments"] = segments_list

    return response


def fetch_kr_financials_from_chroma(symbol: str) -> Optional[Dict[str, Any]]:
    """
    한국 주식 재무 데이터를 Chroma에서 조회하여 프론트에서 사용하는 형식으로 변환
    """
    if not symbol or not symbol.isdigit():
        return None

    try:
        collection = get_kr_fin_collection()
    except Exception as exc:
        print(f"[DEBUG] KR Chroma client init error: {exc}")
        return None

    try:
        result = collection.get(
            where={"stock_code": symbol},
            limit=1,
            include=["metadatas", "documents"],
        )
    except Exception as exc:
        print(f"[DEBUG] KR Chroma get() error: {exc}")
        return None

    documents = result.get("documents") or []
    metadatas = result.get("metadatas") or []
    if not documents:
        return None

    raw_doc = documents[0]
    metadata = metadatas[0] if metadatas else {}

    try:
        payload = json.loads(raw_doc) if isinstance(raw_doc, str) else raw_doc
    except (json.JSONDecodeError, TypeError):
        return None

    # Helper to convert 억 원 → 원 단위
    def to_won(value: Any) -> float:
        if value is None:
            return 0.0
        try:
            return float(str(value).replace(",", "")) * 100_000_000.0
        except ValueError:
            return 0.0

    def quarter_key(label: str) -> Tuple[int, int]:
        match = re.match(r"(\d{4})Q(\d)", str(label))
        if match:
            return int(match.group(1)), int(match.group(2))
        return (0, 0)

    quarter_rows: List[Dict[str, Any]] = []
    quarter_revenue: List[Dict[str, Any]] = []
    quarter_net_income: List[Dict[str, Any]] = []
    quarter_operating: List[Dict[str, Any]] = []
    quarters = payload.get("q4") or []
    for item in quarters:
        label = item.get("분기") or f"{item.get('연도', '')}Q"
        revenue = to_won(item.get("매출액(억 원)"))
        operating = to_won(item.get("영업이익(억 원)"))
        net_income = to_won(item.get("당기순이익(억 원)"))
        quarter_rows.append(
            {
                "year": label,
                "revenue": revenue,
                "operatingIncome": operating,
                "netIncome": net_income,
            }
        )
        quarter_revenue.append({"year": label, "value": revenue})
        quarter_net_income.append({"year": label, "value": net_income})
        quarter_operating.append({"year": label, "value": operating})

    quarter_rows.sort(key=lambda row: quarter_key(row["year"]))
    quarter_revenue.sort(key=lambda row: quarter_key(row["year"]))
    quarter_net_income.sort(key=lambda row: quarter_key(row["year"]))
    quarter_operating.sort(key=lambda row: quarter_key(row["year"]))

    year_rows: List[Dict[str, Any]] = []
    year_revenue: List[Dict[str, Any]] = []
    year_net_income: List[Dict[str, Any]] = []
    year_operating: List[Dict[str, Any]] = []
    years = payload.get("y4") or []
    for item in years:
        label = str(item.get("연도"))
        revenue = to_won(item.get("매출액(억 원)"))
        operating = to_won(item.get("영업이익(억 원)"))
        net_income = to_won(item.get("당기순이익(억 원)"))
        year_rows.append(
            {
                "year": label,
                "revenue": revenue,
                "operatingIncome": operating,
                "netIncome": net_income,
            }
        )
        year_revenue.append({"year": label, "value": revenue})
        year_net_income.append({"year": label, "value": net_income})
        year_operating.append({"year": label, "value": operating})

    year_rows.sort(key=lambda row: row["year"])
    year_revenue.sort(key=lambda row: row["year"])
    year_net_income.sort(key=lambda row: row["year"])
    year_operating.sort(key=lambda row: row["year"])

    chart_rows = quarter_rows + year_rows
    revenue_series = quarter_revenue + year_revenue
    net_income_series = quarter_net_income + year_net_income
    operating_series = quarter_operating + year_operating

    latest_entry = quarter_rows[-1] if quarter_rows else (year_rows[-1] if year_rows else {})

    response: Dict[str, Any] = {
        "revenue": revenue_series,
        "netIncome": net_income_series,
        "operatingIncome": operating_series,
        "chartData": chart_rows,
        "latest": {
            "year": latest_entry.get("year", ""),
            "revenue": latest_entry.get("revenue", 0.0),
            "operatingIncome": latest_entry.get("operatingIncome", 0.0),
            "netIncome": latest_entry.get("netIncome", 0.0),
        },
        "currency": "KRW",
    }

    as_of = payload.get("as_of") or metadata.get("as_of")
    if as_of:
        response["asOf"] = as_of

    segments = payload.get("segments") or {}
    if isinstance(segments, dict) and segments:
        segment_rows = []
        total_value = 0.0
        converted_segments: Dict[str, float] = {}
        for name, value in segments.items():
            try:
                amount = float(str(value).replace(",", ""))
            except ValueError:
                continue
            converted_segments[name] = amount
            total_value += amount

        for name, amount in converted_segments.items():
            segment_rows.append(
                {
                    "segment": name,
                    "revenue": amount,
                    "percentage": (amount / total_value * 100.0) if total_value else 0.0,
                }
            )

        if segment_rows:
            segment_rows.sort(key=lambda item: item["revenue"], reverse=True)
            response["segments"] = segment_rows
            response["segmentCurrency"] = "KRW"
            if as_of:
                response["segmentDate"] = as_of

    response["source"] = {
        "collection": KR_FIN_COLLECTION,
        "doc_id": metadata.get("doc_id"),
    }

    return response


__all__ = [
    "fetch_us_stock_news",
    "get_us_news_collection",
    "get_chroma_client",
    "fetch_us_financials_from_chroma",
    "fetch_kr_financials_from_chroma",
    "get_us_fin_collection",
    "get_kr_fin_collection",
]

