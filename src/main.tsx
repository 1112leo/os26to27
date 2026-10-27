import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { HomePage, Layout, NotFoundPage } from './App';
import TypingPage from './typing/TypingPage';
import ResultsPage from './typing/ResultsPage';
import WritePage from './letters/WritePage';
import CompletePage from './letters/CompletePage';
import AdminPage from './admin/AdminPage';
import WelcomePage from './welcome/WelcomePage';
import './styles.css';

const router = createBrowserRouter([{
  element: <Layout />,
  children: [
    { path: '/', element: <HomePage /> },
    { path: '/typing', element: <TypingPage /> },
    { path: '/typing/results', element: <ResultsPage /> },
    { path: '/write', element: <WritePage /> },
    { path: '/write/complete', element: <CompletePage /> },
    { path: '/admin', element: <AdminPage /> },
    { path: '/welcome', element: <WelcomePage /> },
    { path: '*', element: <NotFoundPage /> },
  ],
}]);
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><RouterProvider router={router} /></React.StrictMode>);
