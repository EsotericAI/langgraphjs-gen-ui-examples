import StockPrice from "./stockbroker/stock-price";
import PortfolioView from "./stockbroker/portfolio-view";
import AccommodationsList from "./trip-planner/accommodations-list";
import RestaurantsList from "./trip-planner/restaurants-list";
import BuyStock from "./stockbroker/buy-stock";
import Plan from "./open-code/plan";
import ProposedChange from "./open-code/proposed-change";
import { Writer } from "./writer";
import BizDate from "./promo-brain/biz-date/index";
import CSVPreview from "./promo-brain/csv-preview/index";

const ComponentMap = {
  "stock-price": StockPrice,
  portfolio: PortfolioView,
  "accommodations-list": AccommodationsList,
  "restaurants-list": RestaurantsList,
  "buy-stock": BuyStock,
  "code-plan": Plan,
  "proposed-change": ProposedChange,
  writer: Writer,
  "biz-date": BizDate,
  "csv-preview": CSVPreview,
} as const;
export default ComponentMap;
