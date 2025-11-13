const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;
const PYTHON_SERVER_URL = 'http://localhost:5000';

app.use(cors());
app.use(express.json());

// 정적 파일 서빙 (프론트엔드) - 프로젝트 루트 기준
const frontendPath = path.join(__dirname, '..', '..', 'frontend');
app.use(express.static(frontendPath));

// 루트 경로는 index.html 서빙
app.get('/', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// 해외 주식 매핑 데이터 로드
let FOREIGN_STOCK_DATA = [];
try {
  const mappingFile = path.join(__dirname, 'stock-mapping.json');
  const mappingContent = fs.readFileSync(mappingFile, 'utf8');
  FOREIGN_STOCK_DATA = JSON.parse(mappingContent);
  console.log(`[OK] 해외 주식 매핑 데이터 로드 완료: ${FOREIGN_STOCK_DATA.length}개`);
} catch (error) {
  console.error('[ERROR] 해외 주식 매핑 파일 로드 실패:', error.message);
  // 폴백: 기본 매핑
  FOREIGN_STOCK_DATA = [];
}

// 빠른 검색을 위한 인덱스 생성 (한글 이름 → 티커 매핑)
const FOREIGN_STOCK_INDEX = {};
FOREIGN_STOCK_DATA.forEach(stock => {
  // 한글 이름들 인덱싱
  if (stock.ko && Array.isArray(stock.ko)) {
    stock.ko.forEach(koName => {
      const normalized = koName.trim().toLowerCase();
      if (normalized) {
        FOREIGN_STOCK_INDEX[normalized] = {
          ticker: stock.ticker,
          en: stock.en,
          exchange: stock.exchange
        };
      }
    });
  }
  // 영어 이름 인덱싱
  if (stock.en) {
    const normalized = stock.en.trim().toLowerCase();
    if (normalized) {
      FOREIGN_STOCK_INDEX[normalized] = {
        ticker: stock.ticker,
        en: stock.en,
        exchange: stock.exchange
      };
    }
  }
  // 티커 자체도 인덱싱
  if (stock.ticker) {
    const normalized = stock.ticker.trim().toUpperCase();
    FOREIGN_STOCK_INDEX[normalized.toLowerCase()] = {
      ticker: stock.ticker,
      en: stock.en,
      exchange: stock.exchange
    };
  }
});

// 한국 주식 심볼 코드 패턴 (6자리 숫자로 시작)
const isKoreanStockSymbol = (query) => {
  return /^\d{6}$/.test(query) || query.includes('.KS') || query.includes('.KQ');
};

// 해외 주식 티커 패턴 확인 (2-5자리 대문자 알파벳, 숫자 없음)
const isForeignStockTicker = (query) => {
  // 정확한 티커 패턴: 2-5자리 대문자 알파벳만 (숫자 없음)
  // 예: AAPL, MSFT, TSLA, NVDA, META 등
  const tickerPattern = /^[A-Z]{2,5}$/;
  return tickerPattern.test(query.trim().toUpperCase());
};

// 해외 주식 심볼 변환 (개선된 검색)
const convertToForeignSymbol = (query) => {
  const normalized = query.trim().toLowerCase();
  
  // 1. 정확한 매칭 먼저 시도
  if (FOREIGN_STOCK_INDEX[normalized]) {
    const result = FOREIGN_STOCK_INDEX[normalized];
    console.log(`해외 주식 정확 매칭: "${query}" -> ${result.ticker} (${result.en})`);
    return result.ticker;
  }
  
  // 2. 부분 매칭 시도 (한글 이름 배열에서 검색)
  for (const stock of FOREIGN_STOCK_DATA) {
    // 한글 이름 배열 검색
    if (stock.ko && Array.isArray(stock.ko)) {
      for (const koName of stock.ko) {
        if (koName.toLowerCase().includes(normalized) || normalized.includes(koName.toLowerCase())) {
          console.log(`해외 주식 부분 매칭 (한글): "${query}" -> ${stock.ticker} (${stock.en})`);
          return stock.ticker;
        }
      }
    }
    // 영어 이름 부분 매칭
    if (stock.en && stock.en.toLowerCase().includes(normalized)) {
      console.log(`해외 주식 부분 매칭 (영어): "${query}" -> ${stock.ticker} (${stock.en})`);
      return stock.ticker;
    }
    // 티커 부분 매칭
    if (stock.ticker && stock.ticker.toLowerCase().includes(normalized)) {
      console.log(`해외 주식 티커 매칭: "${query}" -> ${stock.ticker} (${stock.en})`);
      return stock.ticker;
    }
  }
  
  return null;
};

// Yahoo Finance auto-complete 검색 (회사명 → 티커)
const yahooSearchCache = new Map();
const searchForeignTicker = async (name) => {
  const trimmed = (name || '').trim();
  if (!trimmed) return null;

  const cacheKey = trimmed.toLowerCase();
  if (yahooSearchCache.has(cacheKey)) {
    return yahooSearchCache.get(cacheKey);
  }

  try {
    const response = await axios.get('https://query1.finance.yahoo.com/v1/finance/search', {
      params: {
        q: trimmed,
        quotesCount: 5,
        newsCount: 0
      },
      timeout: 3000
    });

    const quotes = response.data?.quotes || [];
    // 우선순위: EQUITY/ETF 등 유효한 심볼
    const best = quotes.find(q =>
      q.symbol &&
      q.symbol.length <= 6 &&
      (q.quoteType === 'EQUITY' || q.quoteType === 'ETF' || q.typeDisp === 'Equity')
    ) || quotes[0];

    if (best && best.symbol) {
      const result = {
        symbol: best.symbol,
        exchange: best.exchange || best.fullExchangeName || null,
        name: best.shortname || best.longname || best.symbol
      };
      yahooSearchCache.set(cacheKey, result);
      return result;
    }
  } catch (error) {
    console.log(`Yahoo 검색 실패: ${trimmed} - ${error.message}`);
  }

  yahooSearchCache.set(cacheKey, null);
  return null;
};

// 주가 정보 조회 API
app.get('/api/stock/:query', async (req, res) => {
  try {
    const query = req.params.query;
    
    // 한국 주식인지 확인 (숫자 6자리 또는 .KS/.KQ 포함)
    if (isKoreanStockSymbol(query)) {
      // 한국 주식은 Python 서버로 전달
      const response = await axios.get(`${PYTHON_SERVER_URL}/api/kr-stock/${query}`);
      return res.json(response.data);
    } else {
      // 해외 주식 처리
      let symbol;
      
      // 1. 먼저 티커 패턴 확인 (AAPL, TSLA 등 확실한 해외 주식 티커)
      if (isForeignStockTicker(query)) {
        // 확실한 해외 주식 티커는 바로 Yahoo Finance로 검색
        console.log(`해외 주식 티커 감지: ${query}`);
        symbol = query.trim().toUpperCase();
      } else {
        // 0. Yahoo auto-complete로 티커 검색 시도
        const yahooResult = await searchForeignTicker(query);
        if (yahooResult && yahooResult.symbol) {
          symbol = yahooResult.symbol.trim().toUpperCase();
          console.log(`Yahoo 검색 변환: ${query} -> ${symbol} (${yahooResult.exchange || '알수없음'})`);
        }

        // 2. 해외 주식 심볼 변환 확인 (한글 회사명 → 심볼)
        const convertedSymbol = symbol ? null : convertToForeignSymbol(query);
        
        if (!symbol && convertedSymbol) {
          // 해외 주식으로 확정된 경우 바로 Yahoo Finance로 검색
          console.log(`해외 주식 심볼 변환: ${query} -> ${convertedSymbol}`);
          symbol = convertedSymbol;
        } else if (!symbol) {
          // 3. 해외 주식 매핑이 없으면 한국 주식 서버에서 먼저 검색 시도
          try {
            const krResponse = await axios.get(`${PYTHON_SERVER_URL}/api/kr-stock/search/${encodeURIComponent(query)}`);
            if (krResponse.data && !krResponse.data.error) {
              console.log(`한국 주식 검색 성공: ${query} -> ${krResponse.data.name}`);
              return res.json(krResponse.data);
            }
          } catch (krError) {
            // 한국 주식 검색 실패 시 로그 출력 후 해외 주식으로 진행
            if (krError.response) {
              console.log(`한국 주식 검색 실패 (${krError.response.status}): ${query}, 해외 주식으로 시도`);
            } else {
              console.log(`한국 주식 검색 오류: ${query} - ${krError.message}, 해외 주식으로 시도`);
            }
          }
          symbol = query.toUpperCase();
        }
      }
      
      // 해외 주식은 Yahoo Finance API 직접 호출
      try {
        // Yahoo Finance 비공식 API 사용
        const yfResponse = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`, {
          params: {
            interval: '1d',
            range: '1d'
          }
        });

        if (!yfResponse.data || !yfResponse.data.chart || !yfResponse.data.chart.result || yfResponse.data.chart.result.length === 0) {
          return res.status(404).json({ error: '주식을 찾을 수 없습니다.' });
        }

        const resultData = yfResponse.data.chart.result[0];
        const meta = resultData.meta;
        const quote = resultData.indicators.quote[0];
        
        if (!meta || !quote) {
          return res.status(404).json({ error: '주식 데이터를 가져올 수 없습니다.' });
        }

        const currentPrice = meta.regularMarketPrice || meta.previousClose;
        const previousClose = meta.previousClose || currentPrice;
        const change = currentPrice - previousClose;
        const changePercent = previousClose ? (change / previousClose) * 100 : 0;

        // 뉴스는 버튼 클릭 시에만 가져오므로 여기서는 제외
        const result = {
          symbol: meta.symbol,
          name: meta.longName || meta.shortName || symbol,
          price: currentPrice,
          change: change,
          changePercent: changePercent,
          volume: meta.regularMarketVolume || 0,
          marketCap: meta.marketCap,
          currency: meta.currency || 'USD',
          exchange: meta.exchangeName || meta.exchange,
          open: quote.open ? quote.open[quote.open.length - 1] : currentPrice,
          high: quote.high ? quote.high[quote.high.length - 1] : currentPrice,
          low: quote.low ? quote.low[quote.low.length - 1] : currentPrice,
          isKorean: false
        };

        return res.json(result);
      } catch (yfError) {
        console.error('Yahoo Finance API 오류:', yfError.message);
        return res.status(404).json({ error: '주식을 찾을 수 없습니다.' });
      }
    }
  } catch (error) {
    console.error('주가 정보 조회 오류:', error);
    return res.status(500).json({ error: '주가 정보를 가져올 수 없습니다.' });
  }
});

// 차트 데이터 조회 API
app.get('/api/stock/:query/chart', async (req, res) => {
  try {
    const query = req.params.query;
    const period = req.query.period || '1m'; // 1m, 6m, 1y
    
    // 기간에 따른 interval 설정
    let interval = '1d';
    let period1, period2;
    const now = Math.floor(Date.now() / 1000);
    
    switch (period) {
      case '1m':
        period1 = now - (30 * 24 * 60 * 60);
        break;
      case '3m':
        period1 = now - (90 * 24 * 60 * 60);
        break;
      case '6m':
        period1 = now - (180 * 24 * 60 * 60);
        break;
      case '1y':
        period1 = now - (365 * 24 * 60 * 60);
        break;
      default:
        period1 = now - (30 * 24 * 60 * 60);
    }
    period2 = now;

    if (isKoreanStockSymbol(query)) {
      // 한국 주식 차트는 Python 서버로
      const response = await axios.get(`${PYTHON_SERVER_URL}/api/kr-stock/${query}/chart?period=${period}`);
      return res.json(response.data);
    } else {
      // 해외 주식 차트 (Yahoo Finance API 직접 호출)
      try {
        const symbol = query.toUpperCase();
        const range = period === '1m' ? '1mo' : period === '3m' ? '3mo' : period === '6m' ? '6mo' : '1y';
        
        const yfResponse = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`, {
          params: {
            interval: '1d',
            range: range
          }
        });

        if (!yfResponse.data || !yfResponse.data.chart || !yfResponse.data.chart.result || yfResponse.data.chart.result.length === 0) {
          return res.status(404).json({ error: '차트 데이터를 찾을 수 없습니다.' });
        }

        const resultData = yfResponse.data.chart.result[0];
        const timestamps = resultData.timestamp;
        const quote = resultData.indicators.quote[0];

        if (!timestamps || !quote) {
          return res.status(404).json({ error: '차트 데이터를 찾을 수 없습니다.' });
        }

        const chartData = [];
        for (let i = 0; i < timestamps.length; i++) {
          if (quote.open[i] !== null && quote.close[i] !== null) {
            chartData.push({
              date: new Date(timestamps[i] * 1000).toISOString().split('T')[0],
              open: quote.open[i],
              high: quote.high[i],
              low: quote.low[i],
              close: quote.close[i],
              volume: quote.volume[i] || 0
            });
          }
        }

        return res.json({
          symbol,
          period,
          data: chartData
        });
      } catch (yfError) {
        console.error('Yahoo Finance 차트 API 오류:', yfError.message);
        return res.status(404).json({ error: '차트 데이터를 찾을 수 없습니다.' });
      }
    }
  } catch (error) {
    console.error('차트 데이터 조회 오류:', error);
    return res.status(500).json({ error: '차트 데이터를 가져올 수 없습니다.' });
  }
});

// 뉴스 조회 API
app.get('/api/stock/:query/news', async (req, res) => {
  try {
    const query = req.params.query;
    
    // 한국 주식인지 확인
    if (isKoreanStockSymbol(query)) {
      // 한국 주식 뉴스는 Python 서버로
      const response = await axios.get(`${PYTHON_SERVER_URL}/api/kr-stock/${query}/news`);
      return res.json(response.data);
    } else {
      // 해외 주식 심볼 변환 (한글 이름 → 티커)
      const convertedSymbol = convertToForeignSymbol(query);
      let symbol;
      
      if (convertedSymbol) {
        // 변환된 심볼 사용
        console.log(`뉴스 조회: ${query} -> ${convertedSymbol}`);
        symbol = convertedSymbol;
      } else {
        // 변환 실패 시 주가 정보 API로 티커 확인 시도
        try {
          const stockResponse = await axios.get(`http://localhost:${PORT}/api/stock/${encodeURIComponent(query)}`);
          if (stockResponse.data && stockResponse.data.symbol) {
            // 주가 정보에서 심볼 추출 (예: "AAPL" 또는 "AAPL"에서 .KS 제거)
            const extractedSymbol = stockResponse.data.symbol.replace('.KS', '').replace('.KQ', '').toUpperCase();
            if (extractedSymbol && extractedSymbol.length <= 5 && !extractedSymbol.match(/^\d{6}$/)) {
              console.log(`뉴스 조회: 주가 정보에서 티커 추출 ${query} -> ${extractedSymbol}`);
              symbol = extractedSymbol;
            } else {
              symbol = query.toUpperCase();
            }
          } else {
            symbol = query.toUpperCase();
          }
        } catch (err) {
          // 주가 정보 조회 실패 시 대문자로 시도
          console.log(`뉴스 조회: 심볼 변환 실패, 원본 사용 ${query}`);
          symbol = query.toUpperCase();
        }
      }
      
      // 해외 주식 뉴스는 Python 서버로
      const response = await axios.get(`${PYTHON_SERVER_URL}/api/stock/${symbol}/news`);
      return res.json(response.data);
    }
  } catch (error) {
    console.error('뉴스 조회 오류:', error);
    if (error.response) {
      console.error('Python 서버 응답:', error.response.status, error.response.data);
    }
    return res.status(500).json({ error: '뉴스를 가져올 수 없습니다.' });
  }
});

// 재무제표 조회 API
app.get('/api/stock/:query/financials', async (req, res) => {
  try {
    const query = req.params.query;
    
    // 한국 주식인지 확인
    if (isKoreanStockSymbol(query)) {
      // 한국 주식 재무제표는 Python 서버로
      const response = await axios.get(`${PYTHON_SERVER_URL}/api/kr-stock/${query}/financials`);
      return res.json(response.data);
    } else {
      // 해외 주식 재무제표는 Python 서버로
      const symbol = query.toUpperCase();
      const response = await axios.get(`${PYTHON_SERVER_URL}/api/stock/${symbol}/financials`);
      return res.json(response.data);
    }
  } catch (error) {
    console.error('재무제표 조회 오류:', error);
    return res.status(500).json({ error: '재무제표를 가져올 수 없습니다.' });
  }
});

app.listen(PORT, () => {
  console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
  console.log(`Python 서버는 ${PYTHON_SERVER_URL}에서 실행되어야 합니다.`);
});

