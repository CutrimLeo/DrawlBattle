import {defineConfig} from '@playwright/test';
import base from './playwright.config.js';
export default defineConfig({...base,outputDir:'.qa/production-tests',reporter:[['list'],['html',{outputFolder:'.qa/production-report',open:'never'}]],use:{...base.use,baseURL:'http://127.0.0.1:3001'},webServer:{command:'npm start',url:'http://127.0.0.1:3001/health',reuseExistingServer:false,timeout:60000}});
