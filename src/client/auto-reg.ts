import { Tor } from 'tor-control-ts';

import {
  extractVerifyCode,
  findProxies,
  generateUsername,
} from '../util/helpers';
import { pool } from '../util/tasks';
import { CONCURRENCIES } from '../constants';
import { cacheSet, initCache } from '../util/cache';
import { Ficbook } from 'ficbook';
import { poolProxies } from '../util/pools';
import { MailPorary } from 'mailporary';

export class AutoReg {
  private tor: Tor = new Tor({
    host: process.env.HOST,
    port: process.env.TOR_CONTROL_PORT,
    password: process.env.TOR_CONTROL_PASSWORD,
  });
  private mailporary: MailPorary = new MailPorary();

  private contexts: Ficbook[] = [];

  private setupProxies = async (proxies: string[]): Promise<void> => {
    await this.tor.signalNewnym();
    this.contexts = await poolProxies(proxies);
  };

  private register = async (context: Ficbook) => {
    try {
      const email = this.mailporary.getMail();
      const username = generateUsername();
      const { rme, phpSessionId } = await context.auth.register({
        email,
        password: process.env.ACCOUNTS_PASWORD,
        username,
      });

      if (!rme || !phpSessionId) {
        console.log(`[${email}]: can't register`);
        return;
      }

      console.log(`[${email}]: registered`);

      let i = 0;

      const code = await new Promise<string>((resolve) => {
        const inboxInterval = setInterval(async () => {
          const inboxes = await this.mailporary.getInbox(email);
          i++;

          if (inboxes[0]) {
            console.log(`[${email}]: got code`);
            clearInterval(inboxInterval);
            resolve(
              (await this.mailporary.getMessage(email, inboxes[0].id)).body
                .text,
            );
          }

          if (i > 10) {
            clearInterval(inboxInterval);
            resolve('0');
          }
        }, 1000);
      });

      if (code == '0') {
        console.log(`[${email}]: code receiving limit, cancelling`);
        return;
      }

      await context.auth.login(rme, phpSessionId);

      cacheSet(email, { rme, phpSessionId, username });

      console.log(
        `[${email}]: verification status: ${await context.auth.verifyCode(
          extractVerifyCode(code),
        )}`,
      );
      await context.auth.logout();
    } catch {
      console.log(`[some]: can't register`);
    }
  };

  public run = async () => {
    await this.mailporary.authorize();
    await this.tor.connect();
    await initCache();
    console.log('connected to tor');

    await this.setupProxies(await findProxies());

    await pool<Ficbook>(this.contexts, this.register, CONCURRENCIES.register);
    console.log('registered all accounts');
  };
}
