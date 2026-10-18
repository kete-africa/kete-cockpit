import { createServerFn } from "@tanstack/react-start";
import { servicesStatus } from "./status";

// The status page is public: what it says is meant for everyone (phase 11, step E3).
export const fetchStatus = createServerFn({ method: "GET" }).handler(
  async () => ({
    services: await servicesStatus(),
  }),
);
