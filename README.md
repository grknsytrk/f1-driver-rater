# F1 Driver Rating

A Formula 1 driver rating application that lets you rate drivers race-by-race and create your own personalized standings. The official championship is based on a points system that heavily depends on car performance. This app lets you evaluate drivers based on their actual talent and performance instead.

![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/Tailwind-4.1-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-7.2-646CFF?style=flat-square&logo=vite&logoColor=white)

## Features

- **Season Selection** - Browse and rate all F1 seasons from 2020 to present
- **Race-by-Race Rating** - Give scores to drivers after each completed Grand Prix
- **Quick Rate Mode** - If you don't want to rate every race individually, you can assign season-wide ratings to all drivers at once
- **Results Dashboard** - View your season averages with charts and visualizations
- **Teammate Wars** - Compare teammates with real race and qualifying statistics. The app fetches actual finishing positions and calculates head-to-head records
- **Team Colors** - Each driver is color-coded with their authentic F1 team colors for easy recognition
- **Country Flags** - Visual country flags for each Grand Prix location
- **Local Storage** - All your ratings are automatically saved in your browser, so you won't lose them
- **Mobile Friendly** - Works well on phones and tablets, not just desktop
- **Animations** - Smooth transitions and interactions powered by Framer Motion

## Teammate Wars

This feature compares teammates on a race-by-race basis using real data from the API:

- **Race H2H**: Counts who finished ahead in each race. If either driver had a DNF or DSQ, that race is excluded from the count to keep the comparison fair.
- **Quali H2H**: Counts who qualified ahead. This is pure pace comparison with no retirements to worry about.

Mid-season driver swaps are handled automatically. For example, if a driver moves from one team to another mid-season, the system tracks their stats separately for each team stint.

## Getting Started

### Prerequisites

You'll need Node.js version 18 or higher installed on your machine. You can use either npm or yarn as your package manager, whichever you prefer.

### Installation

1. Clone the repository to your local machine:
   ```bash
   git clone https://github.com/grknsytrk/f1-driver-rater.git
   cd f1-driver-rater
   ```

2. Install the dependencies. This might take a minute:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Open your browser and go to `http://localhost:5173`. You should see the app running.

If you want to build for production instead, you can run `npm run build` and the output will be in the `dist` folder.

## Tech Stack

| Technology | Purpose |
|------------|---------|
| React 19 | UI Framework |
| TypeScript | Type Safety |
| Vite | Build Tool and Dev Server |
| TailwindCSS 4 | Styling |
| Framer Motion | Animations |
| Recharts | Data Visualization |
| Axios | API Requests |
| Lucide React | Icons |

## API

The app uses the [Jolpica API](https://api.jolpi.ca/), which is a successor to the now-deprecated Ergast API. It's free to use and provides reliable F1 data.

Data fetched includes:
- Seasons and race schedules
- Race results with finishing positions
- Qualifying results
- Driver and constructor information
- Championship standings

## Project Structure

```
src/
├── api/
│   └── f1Api.ts              # API calls to Jolpica
├── components/
│   ├── SeasonSelector.tsx    # Season selection grid
│   ├── RaceList.tsx          # Race calendar with completion status
│   ├── RatingModal.tsx       # Per-race driver rating modal
│   ├── QuickRateModal.tsx    # Quick season-wide rating modal
│   ├── ResultsDashboard.tsx  # Results display with charts
│   └── TeammateWars.tsx      # Teammate H2H comparison
├── types/
│   └── index.ts              # TypeScript interfaces
├── utils/
│   ├── storage.ts            # LocalStorage helper functions
│   └── countryFlags.tsx      # Country code to flag mappings
├── App.tsx                   # Main application component
├── main.tsx                  # Entry point
└── index.css                 # Global styles and CSS variables
```

## How to Use

1. Select a season you want to rate
2. Pick a completed race from the calendar
3. Give each driver a rating from 1 to 10 based on their performance
4. Check the Results page to see your personalized standings
5. Use Teammate Wars to see how drivers compare against their teammates

You can also use Quick Rate if you just want to give overall season impressions without going race by race.

## Rating System

The rating scale is from 1 to 10. Here's a general guideline, but feel free to use your own criteria:

| Rating | Meaning |
|--------|---------|
| 10 | Exceptional performance, absolutely flawless |
| 8-9 | Excellent, clearly exceeded expectations |
| 6-7 | Good, solid performance |
| 5 | Average, nothing special but nothing wrong either |
| 3-4 | Below average, made some mistakes |
| 1-2 | Poor performance, major errors |

The key is to be consistent with your own standards throughout the season.

## Scripts

```bash
npm run dev      # Start the development server
npm run build    # Build for production
npm run preview  # Preview the production build locally
npm run lint     # Run ESLint to check for issues
npm run test     # Run the test suite
```

## Contributing

Contributions are welcome. If you want to add a feature or fix a bug:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Make your changes and commit them (`git commit -m 'Add your feature'`)
4. Push to your branch (`git push origin feature/your-feature`)
5. Open a Pull Request

## License

This project is open source under the MIT License. You can use it however you like.

## Acknowledgments

- [Jolpica API](https://api.jolpi.ca/) for providing F1 data
- [Formula 1](https://www.formula1.com/) for the inspiration

---

If you have any questions or run into issues, feel free to open an issue on GitHub.
