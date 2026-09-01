import recordBonusRouter from './record-bonus.js';
import recordTossupRouter from './record-tossup.js';

import { checkToken } from '../../../server/authentication.js';

import { Router } from 'express';

const router = Router();

router.use((req, res, next) => {
  const { username, token } = req.session;
  if (!checkToken(username, token)) {
    delete req.session;
    res.sendStatus(401);
    return;
  }

  // Having an account is enough to track your own stats. Requiring a verified
  // email here made stat tracking impossible on any deployment without SMTP
  // configured, since nobody could ever clear the check. Multiplayer still
  // requires verification (server/multiplayer/handle-wss-connection.js).

  next();
});

router.use('/record-bonus', recordBonusRouter);
router.use('/record-tossup', recordTossupRouter);

export default router;
