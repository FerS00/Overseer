package com.agentops.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import com.agentops.service.IngestTokenService;
import org.springframework.http.HttpMethod;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStreamReader;

@Component
public class IngestBodyLimitFilter extends OncePerRequestFilter {
  private static final String TOKEN_HEADER = "X-Agent-Ops-Token";
  public static final int MAX_BYTES = 256 * 1024;
  private final IngestTokenService tokenService;

  public IngestBodyLimitFilter(IngestTokenService tokenService) {
    this.tokenService = tokenService;
  }

  @Override
  protected boolean shouldNotFilter(HttpServletRequest request) {
    return !HttpMethod.POST.matches(request.getMethod()) || !"/api/ingest".equals(request.getRequestURI());
  }

  @Override
  protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {
    if (!tokenService.matches(request.getHeader(TOKEN_HEADER))) {
      response.sendError(HttpServletResponse.SC_UNAUTHORIZED);
      return;
    }
    byte[] body = request.getInputStream().readNBytes(MAX_BYTES + 1);
    if (body.length > MAX_BYTES) {
      response.sendError(HttpServletResponse.SC_REQUEST_ENTITY_TOO_LARGE, "Ingest body exceeds 256 KB");
      return;
    }
    chain.doFilter(new BodyRequest(request, body), response);
  }

  private static final class BodyRequest extends HttpServletRequestWrapper {
    private final byte[] body;
    private BodyRequest(HttpServletRequest request, byte[] body) { super(request); this.body = body; }
    @Override public int getContentLength() { return body.length; }
    @Override public long getContentLengthLong() { return body.length; }
    @Override public ServletInputStream getInputStream() {
      ByteArrayInputStream input = new ByteArrayInputStream(body);
      return new ServletInputStream() {
        @Override public int read() { return input.read(); }
        @Override public boolean isFinished() { return input.available() == 0; }
        @Override public boolean isReady() { return true; }
        @Override public void setReadListener(ReadListener listener) { }
      };
    }
    @Override public BufferedReader getReader() {
      return new BufferedReader(new InputStreamReader(getInputStream(), getCharacterEncoding() == null
          ? java.nio.charset.StandardCharsets.UTF_8 : java.nio.charset.Charset.forName(getCharacterEncoding())));
    }
  }
}
