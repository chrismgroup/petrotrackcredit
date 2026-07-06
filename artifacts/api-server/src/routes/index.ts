import { Router, type IRouter } from "express";
import healthRouter from "./health";
import stateRouter from "./state";

const router: IRouter = Router();

router.use(healthRouter);
router.use(stateRouter);

export default router;
