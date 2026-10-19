import { Router, type IRouter } from "express";
import healthRouter from "./health";
import versionRouter from "./version";
import stateRouter from "./state";
import authRouter from "./auth";
import usersRouter from "./users";
import storageRouter from "./storage";
import notificationsRouter from "./notifications";
import maintenanceWorkflowRouter from "./maintenance-workflow";
import deliveryWorkflowRouter from "./workflow-deliveries";
import financeWorkflowRouter from "./workflow-finance";
import workflowDipsPricesRouter from "./workflow-dips-prices";
import paymentsRouter from "./payments";
import payrollRouter from "./payroll";
import { requireAuth } from "../middlewares/requireAuth";
import { invalidateLiveIdentity } from "../lib/liveIdentity";

const router: IRouter = Router();

// Account role/branch edits and branch-manager changes take effect on the
// user's very next request instead of waiting for the identity cache.
router.use((req, res, next) => {
  if (req.method !== "GET" && (req.path.startsWith("/users") || req.path === "/state/branches" || req.path === "/state/userAccounts")) {
    res.on("finish", () => invalidateLiveIdentity());
  }
  next();
});

router.use(healthRouter);
router.use(versionRouter);
router.use(authRouter);
router.use(requireAuth, stateRouter);
router.use(requireAuth, usersRouter);
router.use(requireAuth, notificationsRouter);
router.use(requireAuth, maintenanceWorkflowRouter);
router.use(requireAuth, deliveryWorkflowRouter);
router.use(requireAuth, financeWorkflowRouter);
router.use(requireAuth, workflowDipsPricesRouter);
router.use(requireAuth, paymentsRouter);
router.use(requireAuth, payrollRouter);
router.use(storageRouter);

export default router;
