import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  fetchFastestSegments,
  fetchLongestConnections,
  fetchLongestSegments,
  fetchSlowestSegments,
  fetchStationSchedule,
  fetchStationsTraffic,
  fetchTripDetails,
  GtfsServiceError,
} from './src/server/gtfsService.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

async function startServer() {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      source: 'polish_trains_gtfs',
    });
  });

  app.get('/api/longest-connections', async (req, res) => {
    const dateParam = typeof req.query.date === 'string' ? req.query.date : undefined;
    const forceRefresh = req.query.refresh === 'true';

    try {
      const payload = await fetchLongestConnections(dateParam, forceRefresh);
      res.json(payload);
    } catch (err) {
      if (err instanceof GtfsServiceError) {
        res.status(err.statusCode).json(err.payload);
        return;
      }
      res.status(500).json({
        code: 'FEED_DOWNLOAD_ERROR',
        message: 'Wystąpił nieoczekiwany błąd serwera podczas przetwarzania danych GTFS.',
        details: err instanceof Error ? err.message : undefined,
      });
    }
  });

  app.get('/api/fastest-segments', async (req, res) => {
    const dateParam = typeof req.query.date === 'string' ? req.query.date : undefined;
    const forceRefresh = req.query.refresh === 'true';

    try {
      const payload = await fetchFastestSegments(dateParam, forceRefresh);
      res.json(payload);
    } catch (err) {
      if (err instanceof GtfsServiceError) {
        res.status(err.statusCode).json(err.payload);
        return;
      }
      res.status(500).json({
        code: 'FEED_DOWNLOAD_ERROR',
        message: 'Wystąpił nieoczekiwany błąd serwera podczas obliczania prędkości GTFS.',
        details: err instanceof Error ? err.message : undefined,
      });
    }
  });

  app.get('/api/longest-segments', async (req, res) => {
    const dateParam = typeof req.query.date === 'string' ? req.query.date : undefined;
    const forceRefresh = req.query.refresh === 'true';

    try {
      const payload = await fetchLongestSegments(dateParam, forceRefresh);
      res.json(payload);
    } catch (err) {
      if (err instanceof GtfsServiceError) {
        res.status(err.statusCode).json(err.payload);
        return;
      }
      res.status(500).json({
        code: 'FEED_DOWNLOAD_ERROR',
        message: 'Wystąpił nieoczekiwany błąd serwera podczas wyszukiwania najdłuższych odcinków GTFS.',
        details: err instanceof Error ? err.message : undefined,
      });
    }
  });

  app.get('/api/slowest-segments', async (req, res) => {
    const dateParam = typeof req.query.date === 'string' ? req.query.date : undefined;
    const forceRefresh = req.query.refresh === 'true';

    try {
      const payload = await fetchSlowestSegments(dateParam, forceRefresh);
      res.json(payload);
    } catch (err) {
      if (err instanceof GtfsServiceError) {
        res.status(err.statusCode).json(err.payload);
        return;
      }
      res.status(500).json({
        code: 'FEED_DOWNLOAD_ERROR',
        message: 'Wystąpił nieoczekiwany błąd serwera podczas wyszukiwania najwolniejszych połączeń GTFS.',
        details: err instanceof Error ? err.message : undefined,
      });
    }
  });

  app.get('/api/stations-traffic', async (req, res) => {
    const dateParam = typeof req.query.date === 'string' ? req.query.date : undefined;
    const forceRefresh = req.query.refresh === 'true';

    try {
      const payload = await fetchStationsTraffic(dateParam, forceRefresh);
      res.json(payload);
    } catch (err) {
      if (err instanceof GtfsServiceError) {
        res.status(err.statusCode).json(err.payload);
        return;
      }
      res.status(500).json({
        code: 'FEED_DOWNLOAD_ERROR',
        message: 'Wystąpił nieoczekiwany błąd serwera podczas agregacji ruchu na stacjach GTFS.',
        details: err instanceof Error ? err.message : undefined,
      });
    }
  });

  app.get('/api/station-schedule', async (req, res) => {
    const stationId = typeof req.query.stationId === 'string' ? req.query.stationId : '';
    const dateParam = typeof req.query.date === 'string' ? req.query.date : undefined;
    if (!stationId) {
      res.status(400).json({
        code: 'STATION_NOT_FOUND',
        message: 'Brak parametru stationId.',
      });
      return;
    }

    try {
      const payload = await fetchStationSchedule(stationId, dateParam);
      res.json(payload);
    } catch (err) {
      if (err instanceof GtfsServiceError) {
        res.status(err.statusCode).json(err.payload);
        return;
      }
      res.status(500).json({
        code: 'PARSE_ERROR',
        message: 'Nie udało się pobrać rozkładu godzinowego dla wybranej stacji.',
        details: err instanceof Error ? err.message : undefined,
      });
    }
  });

  app.get('/api/trip-details', async (req, res) => {
    const tripId = typeof req.query.tripId === 'string' ? req.query.tripId : '';
    if (!tripId) {
      res.status(400).json({ code: 'TRIP_NOT_FOUND', message: 'Brak parametru tripId.' });
      return;
    }
    try {
      const payload = await fetchTripDetails(tripId);
      res.json(payload);
    } catch (err) {
      if (err instanceof GtfsServiceError) {
        res.status(err.statusCode).json(err.payload);
        return;
      }
      res.status(500).json({
        code: 'PARSE_ERROR',
        message: 'Nie udało się pobrać szczegółów kursu.',
        details: err instanceof Error ? err.message : undefined,
      });
    }
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
