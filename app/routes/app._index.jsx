import { useEffect } from "react";
import { useNavigate } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { authenticate } from "../shopify.server";

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return null;
};

export default function Index() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate("/app/dashboard", { replace: true });
  }, [navigate]);

  return null;
}
