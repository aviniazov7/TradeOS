// eslint-disable-next-line no-unused-vars -- motion is used as <m.div> (JSX-uses-vars false positive)
import { m, AnimatePresence } from 'framer-motion';
import { tabSlide, tabTransition } from '../../utils/animations';

// Vertical slide for one tab's body. Y only, so an RTL page doesn't travel
// sideways. The first paint stays put (the page transition already rises);
// changing `tabKey` plays the slide.
export default function TabPanel({ tabKey, children, className }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <m.div
        key={tabKey}
        className={className}
        variants={tabSlide}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={tabTransition}
      >
        {children}
      </m.div>
    </AnimatePresence>
  );
}
