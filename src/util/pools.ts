import { Ficbook } from 'ficbook';

import { delay } from './helpers';
import { pool } from './tasks';
import { CONCURRENCIES } from '../constants';

const HEALTHCHECK_TIMEOUT_MS = 3000;

export const poolProxies = async (rawProxies: string[]): Promise<Ficbook[]> => {
  const contexts: Ficbook[] = [];

  console.log(`got ${rawProxies.length} proxies`);

  await pool<string>(
    rawProxies,
    async (proxy: string) => {
      const ficbook = new Ficbook();
      ficbook.proxy = proxy;

      try {
        if (
          await Promise.race([
            ficbook.healthcheck(),
            new Promise<boolean>((_, reject) =>
              setTimeout(
                () => reject(new Error('Timeout')),
                HEALTHCHECK_TIMEOUT_MS,
              ),
            ),
          ])
        ) {
          contexts.push(ficbook);
          console.log(`connected: ${proxy}`);
          return;
        }

        console.log(`connection failed: ${proxy}`);
      } catch (error) {
        console.log(`connection failed or timed out: ${proxy}`);
      }
    },
    CONCURRENCIES.proxy,
  );

  if (!contexts.length) {
    console.log('no proxies connected');
    await delay(1);
  }

  console.log(`connected proxies length: ${contexts.length}`);

  return contexts;
};
