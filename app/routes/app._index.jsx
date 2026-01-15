import { redirect } from "@remix-run/node";
import { boundary } from "@shopify/shopify-app-remix/server";
import { authenticate } from "../shopify.server";

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  console.log("App Index Request URL:", request.url);
  await authenticate.admin(request);
  return redirect(`/app/dashboard${url.search}`);
};

export default function Index() {
  return null;
}
