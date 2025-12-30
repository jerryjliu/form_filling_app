# Form Filler - Next.js Web App

A modern web interface for AI-powered PDF form filling, built with Next.js 16, React, and Tailwind CSS.

## Features

- **Split-panel layout**: PDF preview on the left, chat interface on the right
- **Multi-turn chat**: Iteratively refine form filling through conversation
- **Real-time streaming**: Watch the agent fill fields in real-time via SSE
- **Form toggle**: Switch between original and filled PDF views
- **Session persistence**: URL-based session IDs for sharing/bookmarking
- **Download filled PDFs**: Export completed forms with one click

## Getting Started

### Prerequisites

- Node.js 18+
- Backend server running at `http://localhost:8000` (see `../backend/`)

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Environment Variables

Create a `.env.local` file (already included):

```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Project Structure

```
web/
├── src/
│   ├── app/
│   │   ├── globals.css    # Tailwind config and CSS variables
│   │   ├── layout.tsx     # Root layout
│   │   └── page.tsx       # Main app page
│   ├── components/
│   │   ├── ChatMessage.tsx   # Individual chat message
│   │   ├── ChatPanel.tsx     # Chat interface with input
│   │   ├── FormFields.tsx    # Detected field list
│   │   ├── LeftPanel.tsx     # PDF upload and preview
│   │   ├── PdfUpload.tsx     # Drag-and-drop upload
│   │   └── PdfViewer.tsx     # PDF display with toggle
│   ├── lib/
│   │   ├── api.ts         # Backend API client
│   │   └── session.ts     # Session management
│   └── types/
│       └── index.ts       # TypeScript definitions
└── package.json
```

## Usage Flow

1. **Upload a PDF**: Drag and drop or click to upload a fillable PDF form
2. **Review detected fields**: The app analyzes the PDF and shows detected form fields
3. **Chat with the agent**: Type natural language instructions like:
   - "My name is John Doe, email john@example.com"
   - "Fill the date with today's date and check all agreement boxes"
   - "Address: 123 Main St, San Francisco, CA 94102"
4. **Watch real-time filling**: See the agent process your request with streaming updates
5. **Toggle views**: Switch between original and filled PDF previews
6. **Download**: Export the filled PDF when satisfied

## Design

The UI is styled to match LlamaCloud's aesthetic:
- Dark theme with purple accent colors
- Clean, minimal interface
- Geist font family
- Responsive split-panel layout

## Development

```bash
# Run development server with hot reload
npm run dev

# Type check
npm run lint

# Build for production
npm run build

# Start production server
npm run start
```

## API Integration

The app communicates with the FastAPI backend via:
- `POST /analyze` - Detect form fields in uploaded PDF
- `POST /fill-agent-stream` - Stream agent form filling (SSE)

See `../backend/` for backend documentation.

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new).

Check out the [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
