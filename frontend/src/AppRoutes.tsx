import { lazy, Suspense, useEffect } from "react";
import { Route, Routes, useLocation } from "react-router";

import { FullPageLoader, PublicOnly, RequireAuth } from "./auth/guards";
import HomePage from "./pages/HomePage";
import { AboutPage, ContactPage, NotFoundPage } from "./pages/InfoPages";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";

// Signed-in pages (chat, markdown, calendars) load on demand, keeping the
// home / login bundle small.
const ConsultPage = lazy(() => import("./pages/ConsultPage"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function AppRoutes() {
  return (
    <>
      <ScrollToTop />
      <Suspense fallback={<FullPageLoader />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route
            path="/login"
            element={
              <PublicOnly>
                <LoginPage />
              </PublicOnly>
            }
          />
          <Route
            path="/register"
            element={
              <PublicOnly>
                <RegisterPage />
              </PublicOnly>
            }
          />
          <Route
            path="/dashboard"
            element={
              <RequireAuth>
                <DashboardPage />
              </RequireAuth>
            }
          />
          <Route
            path="/consult"
            element={
              <RequireAuth>
                <ConsultPage />
              </RequireAuth>
            }
          />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </>
  );
}
