import {
    Page,
    Layout,
    Card,
    BlockStack,
    Text,
    Badge,
    Button,
    FormLayout,
    TextField,
    InlineStack,
    Box
} from "@shopify/polaris";
import { useLoaderData, useSubmit, useNavigate, Link } from "@remix-run/react";
import { useState } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request, params }) => {
    const { admin } = await authenticate.admin(request);

    const review = await prisma.review.findUnique({
        where: { id: params.id },
    });

    if (!review) {
        throw new Response("Review not found", { status: 404 });
    }

    // Fetch Product Details
    let productTitle = "Unknown Product";
    let productImage = null;

    if (review.productId) {
        const gid = review.productId.startsWith("gid://") ? review.productId : `gid://shopify/Product/${review.productId}`;
        try {
            const response = await admin.graphql(
                `#graphql
                query getProduct($id: ID!) {
                    product(id: $id) {
                        title
                        featuredImage {
                            url
                        }
                    }
                }`,
                { variables: { id: gid } }
            );
            const { data } = await response.json();
            if (data?.product) {
                productTitle = data.product.title;
                productImage = data.product.featuredImage?.url;
            }
        } catch (error) {
            console.error("Error fetching product:", error);
        }
    }

    return {
        review: {
            ...review,
            createdAt: review.createdAt.toISOString(),
            updatedAt: review.updatedAt.toISOString(),
        },
        product: {
            title: productTitle,
            image: productImage,
        }
    };
};

export const action = async ({ request, params }) => {
    const { admin } = await authenticate.admin(request);
    const formData = await request.formData();
    const actionType = formData.get("action");
    const reviewId = params.id;

    if (actionType === "approve") {
        await prisma.review.update({
            where: { id: reviewId },
            data: { approved: true },
        });
    } else if (actionType === "delete") {
        await prisma.review.delete({
            where: { id: reviewId },
        });
        return { deleted: true };
    } else if (actionType === "reply") {
        const replyText = formData.get("replyText");
        await prisma.review.update({
            where: { id: reviewId },
            data: {
                reply: replyText,
                replyAt: new Date(),
            },
        });
    }

    return null;
};

export default function ReviewDetail() {
    const { review, product } = useLoaderData();
    const submit = useSubmit();
    const navigate = useNavigate();
    const [replyText, setReplyText] = useState(review.reply || "");

    const handleApprove = () => {
        submit({ action: "approve" }, { method: "post" });
    };

    const handleDelete = () => {
        if (confirm("Are you sure you want to delete this review?")) {
            submit({ action: "delete" }, { method: "post" });
            navigate("/app/dashboard");
        }
    };

    const handleReply = () => {
        submit({ action: "reply", replyText }, { method: "post" });
    };

    return (
        <Page
            backAction={{ content: "Dashboard", url: "/app/dashboard" }}
            title={`Review by ${review.username}`}
            subtitle={new Date(review.createdAt).toLocaleString()}
            primaryAction={
                !review.approved ? {
                    content: "Approve Review",
                    onAction: handleApprove,
                } : undefined
            }
            secondaryActions={[
                {
                    content: "Delete Review",
                    destructive: true,
                    onAction: handleDelete,
                }
            ]}
        >
            <Layout>
                <Layout.Section>
                    <Card>
                        <BlockStack gap="400">
                            <BlockStack gap="200">
                                <Text variant="headingMd" as="h2">Product</Text>
                                <InlineStack gap="400" align="start" blockAlign="center">
                                    {product.image && (
                                        <Box
                                            padding="0"
                                            borderColor="border"
                                            borderWidth="025"
                                            borderRadius="200"
                                            overflowX="hidden"
                                            overflowY="hidden"
                                            minHeight="60px"
                                            minWidth="60px"
                                        >
                                            <img src={product.image} alt={product.title} style={{ width: '60px', height: '60px', objectFit: 'cover' }} />
                                        </Box>
                                    )}
                                    <Text variant="bodyLg" fontWeight="bold">{product.title}</Text>
                                </InlineStack>
                            </BlockStack>

                            <Box paddingBlockStart="400">
                                <BlockStack gap="200">
                                    <InlineStack gap="200" align="start">
                                        <Text variant="headingMd" as="h2">Rating</Text>
                                        <Badge tone={review.rating >= 4 ? "success" : review.rating === 3 ? "attention" : "critical"}>
                                            {review.rating} Stars
                                        </Badge>
                                    </InlineStack>
                                </BlockStack>
                            </Box>

                            <Box paddingBlockStart="200">
                                <BlockStack gap="200">
                                    <Text variant="headingMd" as="h2">Review</Text>
                                    <Text as="p" variant="bodyLg">{review.comment}</Text>
                                </BlockStack>
                            </Box>

                            <Box paddingBlockStart="200">
                                <BlockStack gap="200">
                                    <Text variant="headingMd" as="h2">Customer Info</Text>
                                    <Text as="p">{review.username} ({review.userEmail})</Text>
                                </BlockStack>
                            </Box>

                            <Box paddingBlockStart="400" borderColor="border-subdued" borderBlockStartWidth="025">
                                <FormLayout>
                                    <TextField
                                        label="Reply to Customer"
                                        value={replyText}
                                        onChange={setReplyText}
                                        multiline={4}
                                        autoComplete="off"
                                        helpText="Your reply will be sent to the customer via email (if configured)."
                                    />
                                    <Button onClick={handleReply}>Update Reply</Button>
                                </FormLayout>
                            </Box>
                        </BlockStack>
                    </Card>
                </Layout.Section>
            </Layout>
        </Page>
    );
}
