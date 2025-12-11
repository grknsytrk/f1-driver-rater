# 🏎️ F1 Driver Rating

A premium Formula 1 driver rating application that lets you rate drivers race-by-race and track their season performance with beautiful visualizations.

![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/Tailwind-4.1-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-7.2-646CFF?style=flat-square&logo=vite&logoColor=white)

## ✨ Features

- **🗓️ Season Selection** — Browse Formula 1 seasons from 2020 to present
- **🏁 Race-by-Race Rating** — Rate every driver's performance after each Grand Prix
- **⚡ Quick Rate Mode** — Quickly assign season-wide ratings for all drivers
- **📊 Results Dashboard** — View season averages with beautiful charts and visualizations
- **🎨 Team Colors** — Authentic F1 team color coding for easy recognition
- **🌍 Country Flags** — Visual flags for each Grand Prix location
- **💾 Local Storage** — All your ratings are saved locally in your browser
- **📱 Responsive Design** — Works beautifully on desktop and mobile devices
- **🎬 Smooth Animations** — Powered by Framer Motion for a premium feel

## 🖼️ Screenshots

*Coming soon...*

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/f1-driver-ratings.git
   cd f1-driver-ratings
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the development server**
   ```bash
   npm run dev
   ```

4. **Open your browser**
   Navigate to `http://localhost:5173`

## 🛠️ Tech Stack

| Technology | Purpose |
|------------|---------|
| **React 19** | UI Framework |
| **TypeScript** | Type Safety |
| **Vite** | Build Tool & Dev Server |
| **TailwindCSS 4** | Styling |
| **Framer Motion** | Animations |
| **Recharts** | Data Visualization |
| **Axios** | API Requests |
| **Lucide React** | Icons |

## 📡 API

This app uses the [Jolpica API](https://api.jolpi.ca/) (Ergast successor) to fetch real-time Formula 1 data including:

- Seasons & Races
- Race Results
- Driver & Constructor Information
- Championship Standings

## 📁 Project Structure

```
src/
├── api/
│   └── f1Api.ts          # API calls to Jolpica
├── components/
│   ├── SeasonSelector.tsx    # Season selection grid
│   ├── RaceList.tsx          # Race calendar with status
│   ├── RatingModal.tsx       # Per-race driver rating
│   ├── QuickRateModal.tsx    # Quick season rating
│   └── ResultsDashboard.tsx  # Results & charts
├── types/
│   └── index.ts          # TypeScript interfaces
├── utils/
│   ├── storage.ts        # LocalStorage helpers
│   └── countryFlags.tsx  # Country flag mappings
├── App.tsx               # Main application
├── main.tsx              # Entry point
└── index.css             # Global styles
```

## 🎮 How to Use

1. **Select a Season** — Choose which F1 season you want to rate
2. **Pick a Race** — Select completed races to rate drivers
3. **Rate Drivers** — Give each driver a rating from 1-10 based on their performance
4. **View Results** — Check your personalized driver rankings and season averages
5. **Quick Rate** — Use the ⚡ button for rapid season-wide ratings

## 🎨 Rating System

| Rating | Meaning |
|--------|---------|
| 10 | Perfect/Legendary |
| 8-9 | Excellent |
| 6-7 | Good |
| 5 | Average |
| 3-4 | Below Average |
| 1-2 | Poor |

## 📜 Scripts

```bash
npm run dev      # Start development server
npm run build    # Build for production
npm run preview  # Preview production build
npm run lint     # Run ESLint
```

## 🤝 Contributing

Contributions are welcome! Feel free to:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

## 🙏 Acknowledgments

- [Jolpica API](https://api.jolpi.ca/) for providing F1 data
- [Formula 1](https://www.formula1.com/) for the inspiration
- All the amazing F1 drivers and teams

---

<p align="center">
  Made with ❤️ by an F1 fan
</p>
