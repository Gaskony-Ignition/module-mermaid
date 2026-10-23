import { ComponentRegistry } from '@inductiveautomation/perspective-client';
import { COMPONENT_TYPE, MermaidChartMeta } from './MermaidChart';
import { registerDesignDelegate } from './designMode';
import './MermaidChart.css';

// The Java side registers the same component id; both halves are needed.
ComponentRegistry.register(new MermaidChartMeta());
registerDesignDelegate(COMPONENT_TYPE);
