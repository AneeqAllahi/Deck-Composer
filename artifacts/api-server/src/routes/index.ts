import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import brandRouter from "./brand.js";
import decksRouter from "./decks.js";
import corpusRouter from "./corpus.js";
import storageRouter from "./storage.js";
import projectsRouter from "./projects.js";
import styleDnaRouter from "./styleDna.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(brandRouter);
router.use(projectsRouter);
router.use(decksRouter);
router.use(corpusRouter);
router.use(storageRouter);
router.use(styleDnaRouter);

export default router;
