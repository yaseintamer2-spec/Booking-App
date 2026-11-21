import { Router, type IRouter } from "express";
import healthRouter from "./health";
import matchesRouter from "./matches";
import legalRouter from "./legal";

const router: IRouter = Router();

router.use(healthRouter);
router.use(matchesRouter);
router.use(legalRouter);

export default router;
