import { useState, useEffect } from "react";
import { Form, useActionData, useLoaderData } from "@remix-run/react";
import {
  AppProvider as PolarisAppProvider,
  Button,
  Card,
  FormLayout,
  Page,
  Text,
  TextField,
} from "@shopify/polaris";
import polarisTranslations from "@shopify/polaris/locales/en.json";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { login } from "../../shopify.server";
import { loginErrorMessage } from "./error.server";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }) => {
  const errors = loginErrorMessage(await login(request));

  return { errors, polarisTranslations };
};

export const action = async ({ request }) => {
  const errors = loginErrorMessage(await login(request));

  return {
    errors,
  };
};

export default function Auth() {
  const loaderData = useLoaderData();
  const actionData = useActionData();
  const [shop, setShop] = useState("");
  const { errors } = actionData || loaderData;
  const [isEmbedded, setIsEmbedded] = useState(false);

  useEffect(() => {
    if (window.top !== window.self) {
      setIsEmbedded(true);
    }
  }, []);

  if (isEmbedded) {
    return (
      <PolarisAppProvider i18n={loaderData.polarisTranslations}>
        <Page>
          <Card>
            <FormLayout>
              <Text variant="headingMd" as="h2">
                Log in
              </Text>
              <Text>
                Please open this page in a new tab to complete the login.
              </Text>
              <div style={{ marginTop: "1rem" }}>
                <a
                  href={typeof window !== "undefined" ? window.location.href : ""}
                  target="_top"
                  className="Polaris-Button Polaris-Button--primary"
                  style={{
                    textDecoration: "none",
                    padding: "0.5rem 1rem",
                    background: "#008060",
                    color: "white",
                    borderRadius: "4px",
                  }}
                >
                  Continue to Login
                </a>
              </div>
            </FormLayout>
          </Card>
        </Page>
      </PolarisAppProvider>
    );
  }

  return (
    <PolarisAppProvider i18n={loaderData.polarisTranslations}>
      <Page>
        <Card>
          <Form method="post">
            <FormLayout>
              <Text variant="headingMd" as="h2">
                Log in
              </Text>
              <TextField
                type="text"
                name="shop"
                label="Shop domain"
                helpText="example.myshopify.com"
                value={shop}
                onChange={setShop}
                autoComplete="on"
                error={errors.shop}
              />
              <Button submit>Log in</Button>
            </FormLayout>
          </Form>
        </Card>
      </Page>
    </PolarisAppProvider>
  );
}
