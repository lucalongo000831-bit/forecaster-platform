import { getSchedulerHeartbeats } from "../src/services/jobs/scheduler-heartbeat";

void getSchedulerHeartbeats().then((heartbeats) => { console.log(JSON.stringify(heartbeats, null, 2)); if (heartbeats.some((item) => item.status === "FAILED")) process.exitCode = 1; });
