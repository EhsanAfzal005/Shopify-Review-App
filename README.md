# Shopify Review App

A full-stack Shopify Application built with [Remix](https://remix.run/), [Prisma](https://www.prisma.io/), and [MongoDB](https://www.mongodb.com/). This app allows merchants to collect, manage, and display product reviews on their Shopify store.

## 🚀 Features

### For Merchants (Admin Dashboard)
-   **Dashboard Overview**: View key metrics like total reviews and average rating.
-   **Review Management**: Approve, delete, or reply to customer reviews.
-   **Product Integration**: Reviews are linked directly to Shopify products.

### For Customers (Storefront)
-   **Review Widget**: Built-in Theme App Extension to display reviews on product pages.
-   **Submission Form**: Easy-to-use form for customers to submit ratings and comments.
-   **Public API**: App Proxy enabled for secure frontend communication.

## 🛠 Tech Stack

-   **Framework**: [Remix](https://remix.run/) (React)
-   **Database**: [MongoDB](https://www.mongodb.com/)
-   **ORM**: [Prisma](https://www.prisma.io/)
-   **UI Components**: [Shopify Polaris](https://polaris.shopify.com/)
-   **Styling**: Vanilla CSS / Tailwind (if configured)
-   **Authentication**: Shopify OAuth

## 📋 Prerequisites

Before you begin, ensure you have the following installed:
-   [Node.js](https://nodejs.org/) (v18 or higher)
-   [npm](https://www.npmjs.com/) or [pnpm](https://pnpm.io/)
-   A [Shopify Partner Account](https://partners.shopify.com/)
-   A [MongoDB Database](https://www.mongodb.com/atlas/database) (Atlas or local)

## ⚙️ Installation

1.  **Clone the repository**
    ```bash
    git clone https://github.com/EhsanAfzal005/Shopify-Review-App.git
    cd mean3-review-app
    ```

2.  **Install dependencies**
    ```bash
    npm install
    ```

3.  **Set up Environment Variables**
    Valuable variables are stored in `.env`.
    ```bash
    cp .env.example .env
    ```
    Update `.env` with your MongoDB connection string:
    ```env
    DATABASE_URL="mongodb+srv://<username>:<password>@cluster.mongodb.net/dbname"
    SHOPIFY_API_KEY="your_api_key"
    SHOPIFY_API_SECRET="your_api_secret"
    ```

4.  **Connect Database**
    Generate Prisma client and push the schema to your database.
    ```bash
    npm run setup
    ```

## 🏃‍♂️ Running the App

Start the development server with Shopify CLI:

```bash
npm run dev
```

-   Press `P` to open the development store.
-   Press `G` to open the GraphiQL explorer.

## 🚢 Deployment

This app is designed to be deployed on platforms that support Node.js (e.g., Fly.io, Heroku, Render).

1.  **Build the app**
    ```bash
    npm run build
    ```

2.  **Deploy commands**
    Refer to the [Shopify App Deployment Guide](https://shopify.dev/docs/apps/deployment) for detailed instructions.

## 📂 Project Structure

```
shopify-review-app/
├── app/
│   ├── routes/         # Remix routes (Admin Dashboard pages)
│   ├── db.server.js    # Database connection logic
│   └── root.jsx        # Root component
├── extensions/
│   └── theme-extension # Liquid blocks and assets for Storefront
├── prisma/
│   └── schema.prisma   # Database schema (MongoDB)
├── public/             # Static assets
└── shopify.app.toml    # App configuration
```

## 🤝 Contributing

1.  Fork the repository.
2.  Create a new branch (`git checkout -b feature/amazing-feature`).
3.  Commit your changes (`git commit -m 'Add some amazing feature'`).
4.  Push to the branch (`git push origin feature/amazing-feature`).
5.  Open a Pull Request.

## 📄 License

This project is licensed under the MIT License.
