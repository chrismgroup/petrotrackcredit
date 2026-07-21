import { Router, type IRouter } from "express";
import healthRouter from "./health";
import versionRouter from "./version";
import stateRouter from "./state";
import authRouter from "./auth";
import usersRouter from "./users";
import storageRouter from "./storage";
import vesselsRouter from "./vessels";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

// Public routes — no auth middleware in front
router.use(healthRouter);
router.use(versionRouter);
router.use(authRouter);
router.use(storageRouter);
router.use(vesselsRouter);

// Protected routes — requireAuth blocks unauthenticated access
router.use(requireAuth, stateRouter);
router.use(requireAuth, usersRouter);

export default router;
