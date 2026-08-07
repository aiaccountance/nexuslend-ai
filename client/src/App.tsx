import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import NexusLayout from "./components/NexusLayout";
import Overview from "./pages/dashboard/Overview";
import Analyser from "./pages/dashboard/Analyser";
import Deals from "./pages/dashboard/Deals";
import Portfolio from "./pages/dashboard/Portfolio";
import OpenBanking from "./pages/dashboard/OpenBanking";
import CompaniesHouse from "./pages/dashboard/CompaniesHouse";
import Fraud from "./pages/dashboard/Fraud";
import PolicyEngine from "./pages/dashboard/PolicyEngine";
import ModelPerformance from "./pages/dashboard/ModelPerformance";
import HmrcVat from "./pages/dashboard/HmrcVat";
import PostcodeEnrich from "./pages/dashboard/PostcodeEnrich";
import FxRates from "./pages/dashboard/FxRates";
import ChExtended from "./pages/dashboard/ChExtended";
import Creditsafe from "./pages/dashboard/Creditsafe";
import GeoRisk from "@/pages/dashboard/GeoRisk";
import Demo from "@/pages/Demo";
import AiBankStatementFraud from "@/pages/blog/AiBankStatementFraud";
import FcaConsumerDuty from "@/pages/blog/FcaConsumerDuty";
import CostManualLoanProcessing from "@/pages/blog/CostManualLoanProcessing";
import EarlyAccess from "@/pages/EarlyAccess";
import WaitlistAdmin from "@/pages/dashboard/Waitlist";
import OutfitLayout from "@/pages/outfits/OutfitLayout";
import OutfitFeed from "@/pages/outfits/Feed";
import OutfitUpload from "@/pages/outfits/Upload";
import OutfitBattle from "@/pages/outfits/Battle";
import OutfitLeaderboard from "@/pages/outfits/Leaderboard";
import OutfitProfile from "@/pages/outfits/Profile";

function DashboardRouter() {
  return (
    <NexusLayout>
      <Switch>
        <Route path="/dashboard" component={Overview} />
        <Route path="/dashboard/analyser" component={Analyser} />
        <Route path="/dashboard/deals" component={Deals} />
        <Route path="/dashboard/portfolio" component={Portfolio} />
        <Route path="/dashboard/open-banking" component={OpenBanking} />
        <Route path="/dashboard/companies-house" component={CompaniesHouse} />
        <Route path="/dashboard/ch-extended" component={ChExtended} />
        <Route path="/dashboard/fraud" component={Fraud} />
        <Route path="/dashboard/policy" component={PolicyEngine} />
        <Route
          path="/dashboard/model-performance"
          component={ModelPerformance}
        />
        <Route path="/dashboard/hmrc-vat" component={HmrcVat} />
        <Route path="/dashboard/postcodes" component={PostcodeEnrich} />
        <Route path="/dashboard/fx-rates" component={FxRates} />
        <Route path="/dashboard/creditsafe" component={Creditsafe} />
        <Route path="/dashboard/geo-risk" component={GeoRisk} />
        <Route path="/dashboard/waitlist" component={WaitlistAdmin} />
        <Route component={NotFound} />
      </Switch>
    </NexusLayout>
  );
}

function OutfitArenaRouter() {
  return (
    <OutfitLayout>
      <Switch>
        <Route path="/outfits" component={OutfitFeed} />
        <Route path="/outfits/upload" component={OutfitUpload} />
        <Route path="/outfits/battle" component={OutfitBattle} />
        <Route path="/outfits/leaderboard" component={OutfitLeaderboard} />
        <Route path="/outfits/u/:userId">
          {params => <OutfitProfile userId={params.userId} />}
        </Route>
        <Route component={NotFound} />
      </Switch>
    </OutfitLayout>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/dashboard" component={DashboardRouter} />
      <Route path="/dashboard/:rest*" component={DashboardRouter} />
      <Route path="/outfits/:rest*" component={OutfitArenaRouter} />
      <Route path="/outfits" component={OutfitArenaRouter} />
      <Route path="/demo" component={Demo} />
      <Route
        path="/blog/ai-bank-statement-fraud-detection"
        component={AiBankStatementFraud}
      />
      <Route
        path="/blog/fca-consumer-duty-ai-underwriting"
        component={FcaConsumerDuty}
      />
      <Route
        path="/blog/cost-manual-loan-processing"
        component={CostManualLoanProcessing}
      />
      <Route path="/early-access" component={EarlyAccess} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
