package com.agentops.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfig implements WebMvcConfigurer {

  private final AppProperties props;

  public WebConfig(AppProperties props) {
    this.props = props;
  }

  @Override
  public void addCorsMappings(CorsRegistry registry) {
    String origins = props.getCors();
    if (origins == null || origins.isBlank()) {
      return;
    }
    String[] allowed = java.util.Arrays.stream(origins.split(","))
        .map(String::trim).filter(origin -> !origin.isBlank() && !origin.contains("*")).toArray(String[]::new);
    if (allowed.length == 0) return;
    registry.addMapping("/**")
        .allowedOrigins(allowed)
        .allowedMethods("GET", "POST", "OPTIONS")
        .allowedHeaders("*");
  }
}
