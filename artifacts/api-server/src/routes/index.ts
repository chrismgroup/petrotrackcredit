import { Router, type IRouter } from "express";
import healthRouter from "./health";
import stateRouter from "./state";
import authRouter from "./auth";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(requireAuth, stateRouter);

export default router;
