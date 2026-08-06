import { Router, type IRouter } from "express";
import healthRouter from "./health";
import versionRouter from "./version";
import stateRouter from "./state";
import authRouter from "./auth";
import usersRouter from "./users";
import storageRouter from "./storage";
import notificationsRouter from "./notifications";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(versionRouter);
router.use(authRouter);
router.use(requireAuth, stateRouter);
router.use(requireAuth, usersRouter);
router.use(requireAuth, notificationsRouter);
router.use(storageRouter);

export default router;
