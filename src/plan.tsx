
// Los ajustes de la persona ya «calculados» (horario por días, colores, alias…), para toda la web.
import {createContext,useContext} from 'react';
import {DEFAULT_PLAN,type Plan} from './settings';
export const PlanContext=createContext<Plan>(DEFAULT_PLAN);
export const usePlan=()=>useContext(PlanContext);
