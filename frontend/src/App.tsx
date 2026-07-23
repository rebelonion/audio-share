import { lazy } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router'
import Layout from './components/Layout'

const Home = lazy(() => import('./pages/Home'))
const About = lazy(() => import('./pages/About'))
const Contact = lazy(() => import('./pages/Contact'))
const Stats = lazy(() => import('./pages/Stats'))
const Browse = lazy(() => import('./pages/Browse'))
const Share = lazy(() => import('./pages/Share'))
const Search = lazy(() => import('./pages/Search'))
const Requests = lazy(() => import('./pages/Requests'))
const NotFound = lazy(() => import('./pages/NotFound'))
const Likes = lazy(() => import('./pages/Likes'))
const Recover = lazy(() => import('./pages/Recover'))

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/search" element={<Search />} />
          <Route path="/requests" element={<Requests />} />
          <Route path="/likes" element={<Likes />} />
          <Route path="/recover" element={<Recover />} />
          <Route path="/browse/*" element={<Browse />} />
          <Route path="/share/:key" element={<Share />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
