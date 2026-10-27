import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import { HomePage, Layout, NotFoundPage } from './components/Layout';
import TypingPage from './pages/typing';
import ResultsPage from './admin/typing';
import WritePage, { WriteComplete } from './pages/write';
import AdminPage from './admin/index';
import AdminLayout from './admin/layout';
import SettingsPage from './admin/settings';
import AccountPage from './admin/account';
import WelcomePage from './pages/welcome';
import './styles.css';

const router = createBrowserRouter(
  [
    {
      element: <Layout />,
      children: [
        { path: '/', element: <HomePage /> },
        { path: '/typing', element: <TypingPage /> },
        {
          path: '/typing/results',
          element: <Navigate to="/admin/typing" replace />,
        },
        { path: '/write', element: <WritePage /> },
        { path: '/write/complete', element: <WriteComplete /> },
        {
          path: '/admin',
          element: <AdminLayout />,
          children: [
            { index: true, element: <AdminPage /> },
            { path: 'typing', element: <ResultsPage /> },
            { path: 'settings', element: <SettingsPage /> },
            { path: 'account', element: <AccountPage /> },
          ],
        },
        { path: '/welcome', element: <WelcomePage /> },
        { path: '*', element: <NotFoundPage /> },
      ],
    },
  ],
  { basename: import.meta.env.BASE_URL.replace(/\/$/, '') || '/' },
);
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
