import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "get-a-bud",
  name: "Get a Bud",
  eventKey: process.env.INNGEST_EVENT_KEY,
});
