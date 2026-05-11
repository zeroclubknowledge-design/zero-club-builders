import handler from "../src/server";

export const config = {
  runtime: "edge",
};

export default handler.fetch;
