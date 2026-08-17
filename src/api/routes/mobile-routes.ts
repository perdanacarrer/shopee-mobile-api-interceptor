import express, { Request, Response, Router } from 'express';
import { DeviceFarm } from '../../mobile/scaling/device-farm';
import { SessionPool } from '../../mobile/scaling/session-pool';
import { LoadBalancer } from '../../mobile/scaling/load-balancer';
import { RateLimiter } from '../../utils/rate-limiter';
import { logger } from '../../utils/logger';

const router: Router = express.Router();
const deviceFarm = new DeviceFarm();
const sessionPool = new SessionPool();
const loadBalancer = new LoadBalancer(deviceFarm, sessionPool);
const rateLimiter = new RateLimiter({
  maxRequests: 1000,
  timeWindow: 3600000, // 1 hour
});

// Mock mobile client for demonstration
class MobileClient {
  public deviceId: string;
  
  constructor(deviceId: string) {
    this.deviceId = deviceId;
  }

  async searchProducts(params: any): Promise<any> {
    return {
      code: 0,
      data: {
        items: [],
        total: 0,
        offset: 0
      }
    };
  }

  async getProductDetail(productId: string): Promise<any> {
    return {
      code: 0,
      data: {
        id: productId,
        name: 'Sample Product',
        price: 100,
        currency: 'IDR',
        images: [],
        shop: {
          id: 'shop1',
          name: 'Sample Shop',
          rating: 4.5,
          followers: 1000,
          joinedAt: '2023-01-01',
          location: 'Jakarta',
          responseRate: 95,
          responseTime: 60
        }
      }
    };
  }
}

let mobileClients: MobileClient[] = [];

router.post('/initialize', async (req: Request, res: Response) => {
  try {
    const { deviceCount = 5 } = req.body;
    
    // Initialize multiple mobile clients
    const devices = await deviceFarm.provisionDevices(deviceCount);
    mobileClients = devices.map((device: any) => new MobileClient(device.id));

    res.json({
      success: true,
      devices: devices.length,
      status: 'initialized',
    });
  } catch (error: any) {
    logger.error('Failed to initialize mobile clients', { error });
    res.status(500).json({ error: 'Initialization failed' });
  }
});

router.get('/search', async (req: Request, res: Response) => {
  try {
    const { q, limit = 20, offset = 0, deviceIndex = 0 } = req.query;

    await rateLimiter.checkLimit(`search_${deviceIndex}`);

    if (!mobileClients[Number(deviceIndex)]) {
      throw new Error(`Device ${deviceIndex} not available`);
    }

    const results = await mobileClients[Number(deviceIndex)].searchProducts({
      keyword: q as string,
      limit: Number(limit),
      offset: Number(offset),
    });

    res.json(results);
  } catch (error: any) {
    logger.error('Product search failed', { error, query: req.query });
    res.status(500).json({ error: 'Search failed' });
  }
});

router.get('/product/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { deviceIndex = 0 } = req.query;

    if (!mobileClients[Number(deviceIndex)]) {
      throw new Error(`Device ${deviceIndex} not available`);
    }

    const product = await mobileClients[Number(deviceIndex)].getProductDetail(id);
    
    res.json(product);
  } catch (error: any) {
    logger.error('Product detail fetch failed', { error, productId: req.params.id });
    res.status(500).json({ error: 'Product fetch failed' });
  }
});

router.get('/devices/status', (req: Request, res: Response) => {
  try {
    const status = mobileClients.map((client, index) => ({
      deviceIndex: index,
      deviceId: client.deviceId,
      isActive: true,
    }));

    res.json(status);
  } catch (error: any) {
    logger.error('Device status fetch failed', { error });
    res.status(500).json({ error: 'Status fetch failed' });
  }
});

router.get('/stats', (req: Request, res: Response) => {
  try {
    res.json({
      devices: deviceFarm.getAllDeviceStatuses(),
      sessions: sessionPool.getSessionStats(),
      loadBalancer: loadBalancer.getStats(),
    });
  } catch (error: any) {
    logger.error('Stats fetch failed', { error });
    res.status(500).json({ error: 'Stats fetch failed' });
  }
});

export default router;