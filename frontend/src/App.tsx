import { useEffect } from "react";
import { Route, Routes, useLocation } from "react-router-dom";

import { RequireRole } from "./auth/RequireRole";
import LandlordLayout from "./layouts/LandlordLayout";
import PublicLayout from "./layouts/PublicLayout";
import TenantLayout from "./layouts/TenantLayout";
import ExpensesPage from "./pages/landlord/Expenses";
import FinancesPage from "./pages/landlord/Finances";
import InspectionDetailPage from "./pages/landlord/InspectionDetail";
import InspectionNewPage from "./pages/landlord/InspectionNew";
import InspectionsPage from "./pages/landlord/Inspections";
import MaintenanceDetailPage from "./pages/landlord/MaintenanceDetail";
import MaintenancePage from "./pages/landlord/Maintenance";
import OnboardingPage from "./pages/landlord/Onboarding";
import OverviewPage from "./pages/landlord/Overview";
import PropertiesPage from "./pages/landlord/Properties";
import PropertyDetailPage from "./pages/landlord/PropertyDetail";
import PropertyFormPage from "./pages/landlord/PropertyForm";
import RentTenancyPage from "./pages/landlord/RentTenancy";
import TenantsPage from "./pages/landlord/Tenants";
import UnitDetailPage from "./pages/landlord/UnitDetail";
import { HelpPage, NotFoundPage, NotificationsPage, PrivacyPage } from "./pages/shared";
import SettingsPage from "./pages/Settings";
import ForgotPasswordPage from "./pages/public/ForgotPassword";
import JoinPage from "./pages/public/Join";
import LandingPage from "./pages/public/Landing";
import LoginPage from "./pages/public/Login";
import ResetPasswordPage from "./pages/public/ResetPassword";
import SignupPage from "./pages/public/Signup";
import ReportProblemPage from "./pages/tenant/ReportProblem";
import TenantHomePage from "./pages/tenant/Home";
import TenantInspectionPage from "./pages/tenant/Inspection";
import TenantPaymentsPage from "./pages/tenant/Payments";
import TenantRequestDetailPage from "./pages/tenant/RequestDetail";
import TenantRequestsPage from "./pages/tenant/Requests";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<LandingPage />} />
          <Route path="login" element={<LoginPage />} />
          <Route path="signup" element={<SignupPage />} />
          <Route path="forgot-password" element={<ForgotPasswordPage />} />
          <Route path="reset-password/:uid/:token" element={<ResetPasswordPage />} />
          <Route path="join/:token" element={<JoinPage />} />
          <Route path="help" element={<HelpPage />} />
          <Route path="privacy" element={<PrivacyPage />} />
        </Route>

        <Route path="landlord" element={<RequireRole roles={["landlord", "manager"]}><LandlordLayout /></RequireRole>}>
          <Route index element={<OverviewPage />} />
          <Route path="welcome" element={<OnboardingPage />} />
          <Route path="properties" element={<PropertiesPage />} />
          <Route path="properties/new" element={<PropertyFormPage />} />
          <Route path="properties/:id" element={<PropertyDetailPage />} />
          <Route path="properties/:id/edit" element={<PropertyFormPage />} />
          <Route path="units/:id" element={<UnitDetailPage />} />
          <Route path="tenants" element={<TenantsPage />} />
          <Route path="maintenance" element={<MaintenancePage />} />
          <Route path="maintenance/:id" element={<MaintenanceDetailPage />} />
          <Route path="inspections" element={<InspectionsPage />} />
          <Route path="inspections/new" element={<InspectionNewPage />} />
          <Route path="inspections/:id" element={<InspectionDetailPage />} />
          <Route path="expenses" element={<ExpensesPage />} />
          <Route path="finances" element={<FinancesPage />} />
          <Route path="rent/:id" element={<RentTenancyPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="help" element={<HelpPage inApp />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>

        <Route path="tenant" element={<RequireRole roles={["tenant"]}><TenantLayout /></RequireRole>}>
          <Route index element={<TenantHomePage />} />
          <Route path="home" element={<TenantHomePage />} />
          <Route path="report" element={<ReportProblemPage />} />
          <Route path="requests" element={<TenantRequestsPage />} />
          <Route path="requests/:id" element={<TenantRequestDetailPage />} />
          <Route path="inspections/:id" element={<TenantInspectionPage />} />
          <Route path="payments" element={<TenantPaymentsPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="profile" element={<SettingsPage />} />
          <Route path="help" element={<HelpPage inApp />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>

        <Route element={<PublicLayout />}>
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </>
  );
}
