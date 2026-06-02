import { createApp } from 'vue';
import {
  fluentButton,
  fluentOption,
  fluentProgressRing,
  fluentSelect,
  fluentSlider,
  fluentSwitch,
  fluentTextField,
  provideFluentDesignSystem,
} from '@fluentui/web-components';
import App from './App.vue';
import './styles.css';

provideFluentDesignSystem().register(
  fluentButton(),
  fluentOption(),
  fluentProgressRing(),
  fluentSelect(),
  fluentSlider(),
  fluentSwitch(),
  fluentTextField(),
);

createApp(App).mount('#app');
