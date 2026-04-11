import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import brandRouter from "./brand.js";
import decksRouter from "./decks.js";
import corpusRouter from "./corpus.js";
import storageRouter from "./storage.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(brandRouter);
router.use(decksRouter);
router.use(corpusRouter);
router.use(storageRouter);

export default router;
